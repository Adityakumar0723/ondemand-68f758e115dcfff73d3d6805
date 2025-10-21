#!/bin/bash

API_KEY="<your_api_key>"
BASE_URL="https://api.on-demand.io/chat/v1"

EXTERNAL_USER_ID="<your_external_user_id>"
QUERY="<your_query>"
RESPONSE_MODE=""  # Now dynamic
AGENT_IDS=()  # Dynamic array from PluginIds
ENDPOINT_ID="predefined-openai-gpt4.1"
REASONING_MODE="medium"
FULFILLMENT_PROMPT=""
STOP_SEQUENCES=()  # Dynamic array
TEMPERATURE=0.7
TOP_P=1
MAX_TOKENS=0
PRESENCE_PENALTY=0
FREQUENCY_PENALTY=0

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required for JSON parsing. Please install jq."
    exit 1
fi

main() {
    if [ "$API_KEY" = "<your_api_key>" ] || [ -z "$API_KEY" ]; then
        echo "❌ Please set API_KEY."
        exit 1
    fi
    if [ "$EXTERNAL_USER_ID" = "<your_external_user_id>" ] || [ -z "$EXTERNAL_USER_ID" ]; then
        EXTERNAL_USER_ID=$(uuidgen)
        echo "⚠️  Generated EXTERNAL_USER_ID: $EXTERNAL_USER_ID"
    fi

    CONTEXT_METADATA='[{"key": "userId", "value": "1"}, {"key": "name", "value": "John"}]'

    SESSION_ID=$(create_chat_session)
    if [ ! -z "$SESSION_ID" ]; then
        echo -e "\n--- Submitting Query ---"
        echo "Using query: '$QUERY'"
        echo "Using responseMode: '$RESPONSE_MODE'"
        submit_query "$SESSION_ID" "$CONTEXT_METADATA"  # 👈 updated
    fi
}

create_chat_session() {
    URL="$BASE_URL/sessions"

    CONTEXT_METADATA='[{"key": "userId", "value": "1"}, {"key": "name", "value": "John"}]'

    # Prepare agentIds as JSON array
    AGENT_IDS_JSON=$(printf '%s\n' "${AGENT_IDS[@]}" | jq -R . | jq -s .)

    BODY=$(jq -n \
        --argjson agentIds "$AGENT_IDS_JSON" \
        --arg externalUserId "$EXTERNAL_USER_ID" \
        --argjson contextMetadata "$CONTEXT_METADATA" \
        '{agentIds: $agentIds, externalUserId: $externalUserId, contextMetadata: $contextMetadata}')

    echo "📡 Creating session with URL: $URL"
    echo "📝 Request body: $BODY"

    RESPONSE=$(curl -s -w "%{http_code}" -X POST "$URL" \
        -H "apikey: $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$BODY")

    STATUS_CODE="${RESPONSE: -3}"
    BODY="${RESPONSE:0:${#RESPONSE}-3}"

    if [ "$STATUS_CODE" -eq 201 ]; then
        SESSION_ID=$(echo "$BODY" | jq -r '.data.id')
        echo "✅ Chat session created. Session ID: $SESSION_ID"

        CONTEXT_METADATA_COUNT=$(echo "$BODY" | jq '.data.contextMetadata | length')
        if [ "$CONTEXT_METADATA_COUNT" -gt 0 ]; then
            echo "📋 Context Metadata:"
            echo "$BODY" | jq -r '.data.contextMetadata[] | " - \(.key): \(.value)"'
        fi

        echo "$SESSION_ID"
    else
        echo "❌ Error creating chat session: $STATUS_CODE - $BODY"
        echo ""
    fi
}

submit_query() {
    local SESSION_ID="$1"
    local CONTEXT_METADATA="$2"

    URL="$BASE_URL/sessions/$SESSION_ID/query"

    # Prepare agentIds as JSON array
    AGENT_IDS_JSON=$(printf '%s\n' "${AGENT_IDS[@]}" | jq -R . | jq -s .)

    # Prepare stopSequences as JSON array
    STOP_SEQUENCES_JSON=$(printf '%s\n' "${STOP_SEQUENCES[@]}" | jq -R . | jq -s .)

    BODY=$(jq -n \
        --arg endpointId "$ENDPOINT_ID" \
        --arg query "$QUERY" \
        --argjson agentIds "$AGENT_IDS_JSON" \
        --arg responseMode "$RESPONSE_MODE" \
        --arg reasoningMode "$REASONING_MODE" \
        --arg fulfillmentPrompt "$FULFILLMENT_PROMPT" \
        --argjson stopSequences "$STOP_SEQUENCES_JSON" \
        --argjson temperature "$TEMPERATURE" \
        --argjson topP "$TOP_P" \
        --argjson maxTokens "$MAX_TOKENS" \
        --argjson presencePenalty "$PRESENCE_PENALTY" \
        --argjson frequencyPenalty "$FREQUENCY_PENALTY" \
        '{
            endpointId: $endpointId,
            query: $query,
            agentIds: $agentIds,
            responseMode: $responseMode,
            reasoningMode: $reasoningMode,
            modelConfigs: {
                fulfillmentPrompt: $fulfillmentPrompt,
                stopSequences: $stopSequences,
                temperature: $temperature,
                topP: $topP,
                maxTokens: $maxTokens,
                presencePenalty: $presencePenalty,
                frequencyPenalty: $frequencyPenalty
            }
        }')

    echo "🚀 Submitting query to URL: $URL"
    echo "📝 Request body: $BODY"
    echo ""

    if [ "$RESPONSE_MODE" = "sync" ]; then
        RESPONSE=$(curl -s -w "%{http_code}" -X POST "$URL" \
            -H "apikey: $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$BODY")

        STATUS_CODE="${RESPONSE: -3}"
        BODY="${RESPONSE:0:${#RESPONSE}-3}"

        if [ "$STATUS_CODE" -eq 200 ]; then
            # Append contextMetadata
            FINAL=$(echo "$BODY" | jq --argjson cm "$CONTEXT_METADATA" '.data.contextMetadata = $cm')

            echo "✅ Final Response (with contextMetadata appended):"
            echo "$FINAL" | jq .
        else
            echo "❌ Error submitting sync query: $STATUS_CODE - $BODY"
        fi
    elif [ "$RESPONSE_MODE" = "stream" ]; then
        echo "✅ Streaming Response..."

        curl -s -N -X POST "$URL" \
            -H "apikey: $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$BODY" | while IFS= read -r line; do
                if [[ "$line" =~ ^data: ]]; then
                    data_str="${line#data:}"
                    data_str=$(echo "$data_str" | xargs)

                    if [ "$data_str" = "[DONE]" ]; then
                        break
                    fi

                    event=$(echo "$data_str" | jq . 2>/dev/null)
                    if [ $? -ne 0 ]; then
                        continue
                    fi

                    event_type=$(echo "$event" | jq -r '.eventType')
                    if [ "$event_type" = "fulfillment" ]; then
                        answer=$(echo "$event" | jq -r '.answer // empty')
                        session_id=$(echo "$event" | jq -r '.sessionId // empty')
                        message_id=$(echo "$event" | jq -r '.messageId // empty')
                        full_answer+="$answer"
                        final_session_id="$session_id"
                        final_message_id="$message_id"
                    elif [ "$event_type" = "metricsLog" ]; then
                        metrics=$(echo "$event" | jq '.publicMetrics')
                    fi
                fi
            done

        FINAL_RESPONSE=$(jq -n \
            --arg message "Chat query submitted successfully" \
            --arg sessionId "$final_session_id" \
            --arg messageId "$final_message_id" \
            --arg answer "$full_answer" \
            --argjson metrics "${metrics:-{}}" \
            --arg status "completed" \
            --argjson contextMetadata "$CONTEXT_METADATA" \
            '{
                message: $message,
                data: {
                    sessionId: $sessionId,
                    messageId: $messageId,
                    answer: $answer,
                    metrics: $metrics,
                    status: $status,
                    contextMetadata: $contextMetadata
                }
            }')

        echo -e "\n✅ Final Response (with contextMetadata appended):"
        echo "$FINAL_RESPONSE" | jq .
    fi
}

main
