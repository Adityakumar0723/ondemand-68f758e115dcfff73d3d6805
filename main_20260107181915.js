const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_KEY = "<your_api_key>";
const BASE_URL = "https://api.on-demand.io/chat/v1";
const MEDIA_BASE_URL = "https://api.on-demand.io/media/v1";

let EXTERNAL_USER_ID = "<your_external_user_id>";
const QUERY = "<your_query>";
const RESPONSE_MODE = ""; // Now dynamic
const AGENT_IDS = []; // Dynamic array from PluginIds
const ENDPOINT_ID = "predefined-openai-gpt4.1";
const REASONING_MODE = "grok-4-fast";
const FULFILLMENT_PROMPT = "";
const STOP_SEQUENCES = []; // Dynamic array
const TEMPERATURE = 0.7;
const TOP_P = 1;
const MAX_TOKENS = 0;
const PRESENCE_PENALTY = 0;
const FREQUENCY_PENALTY = 0;

// File upload configuration
const FILE_PATH = "<path_to_your_file>"; // e.g., "/Users/username/Downloads/image.png"
const FILE_NAME = "<file_name>"; // e.g., "image.png"
const CREATED_BY = "AIREV";
const UPDATED_BY = "AIREV";
const FILE_AGENTS = []; // e.g., ["plugin-1744182699", "plugin-1713958591"]

/**
 * Upload a media file to the API
 * @param {string} filePath - Path to the file to upload
 * @param {string} fileName - Name for the uploaded file
 * @param {string[]} plugins - List of plugin IDs to process the file
 * @returns {Promise<Object|null>} Upload response data or null if failed
 */
async function uploadMediaFile(filePath, fileName, agents, sessionId) {
    const url = `${MEDIA_BASE_URL}/public/file/raw`;

    if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found: ${filePath}`);
        return null;
    }

    console.log(`\n--- Uploading Media File ---`);
    console.log(`📁 File: ${filePath}`);
    console.log(`📝 Name: ${fileName}`);
    console.log(`🔌 Agents: ${JSON.stringify(agents)}`);

    try {
        const formData = new FormData();

        // Add file
        formData.append('file', fs.createReadStream(filePath));

        // Add form fields
        formData.append('sessionId', sessionId);
        formData.append('createdBy', CREATED_BY);
        formData.append('updatedBy', UPDATED_BY);
        formData.append('name', fileName);
        formData.append('responseMode', RESPONSE_MODE);

        // Add plugins
        agents.forEach(agent => {
            formData.append('agents', agent);
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': API_KEY,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (response.status === 201 || response.status === 200) {
            const mediaResponse = await response.json();
            console.log(`✅ Media file uploaded successfully!`);
            console.log(`📄 File ID: ${mediaResponse.data.id}`);
            console.log(`🔗 URL: ${mediaResponse.data.url}`);

            if (mediaResponse.data.context) {
                console.log(`📋 Context: ${mediaResponse.data.context.substring(0, 200)}...`);
            }

            return mediaResponse.data;
        } else {
            const respBody = await response.text();
            console.log(`❌ Error uploading media file: ${response.status} - ${respBody}`);
            return null;
        }
    } catch (error) {
        console.log(`❌ Exception during file upload: ${error.message}`);
        return null;
    }
}

async function main() {
    if (API_KEY === "<your_api_key>" || !API_KEY) {
        console.log("❌ Please set API_KEY.");
        process.exit(1);
    }
    if (EXTERNAL_USER_ID === "<your_external_user_id>" || !EXTERNAL_USER_ID) {
        EXTERNAL_USER_ID = uuidv4();
        console.log(`⚠️  Generated EXTERNAL_USER_ID: ${EXTERNAL_USER_ID}`);
    }

    const contextMetadata = [
        { key: "userId", value: "1" },
        { key: "name", value: "John" },
    ];

    const sessionId = await createChatSession(contextMetadata);
    if (sessionId) {
        console.log("\n--- Submitting Query ---");
        console.log(`Using query: '${QUERY}'`);
        console.log(`Using responseMode: '${RESPONSE_MODE}'`);
        // Optional: Upload media file if configured
        let mediaData = null;
        if (FILE_PATH !== "<path_to_your_file>" && FILE_PATH && fs.existsSync(FILE_PATH)) {
            mediaData = await uploadMediaFile(FILE_PATH, FILE_NAME, FILE_AGENTS, sessionId);
            if (mediaData) {
                console.log(`\n✅ Media uploaded.`);
            }
        }
        await submitQuery(sessionId, contextMetadata);
    }
}

async function createChatSession(contextMetadata) {
    const url = `${BASE_URL}/sessions`;

    const body = {
        agentIds: AGENT_IDS,
        externalUserId: EXTERNAL_USER_ID,
        contextMetadata: contextMetadata,
    };

    const jsonBody = JSON.stringify(body);

    console.log(`\n--- Creating Chat Session ---`);
    console.log(`📡 Creating session with URL: ${url}`);
    console.log(`📝 Request body: ${jsonBody}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'apikey': API_KEY,
            'Content-Type': 'application/json'
        },
        body: jsonBody
    });

    if (response.status === 201) {
        const sessionRespData = await response.json();

        console.log(`✅ Chat session created. Session ID: ${sessionRespData.data.id}`);

        if (sessionRespData.data.contextMetadata.length > 0) {
            console.log("📋 Context Metadata:");
            for (const field of sessionRespData.data.contextMetadata) {
                console.log(` - ${field.key}: ${field.value}`);
            }
        }

        return sessionRespData.data.id;
    } else {
        const respBody = await response.text();
        console.log(`❌ Error creating chat session: ${response.status} - ${respBody}`);
        return "";
    }
}

async function submitQuery(sessionId, contextMetadata) {
    const url = `${BASE_URL}/sessions/${sessionId}/query`;
    const body = {
        endpointId: ENDPOINT_ID,
        query: QUERY,
        agentIds: AGENT_IDS,
        responseMode: RESPONSE_MODE,
        reasoningMode: REASONING_MODE,
        modelConfigs: {
            fulfillmentPrompt: FULFILLMENT_PROMPT,
            stopSequences: STOP_SEQUENCES,
            temperature: TEMPERATURE,
            topP: TOP_P,
            maxTokens: MAX_TOKENS,
            presencePenalty: PRESENCE_PENALTY,
            frequencyPenalty: FREQUENCY_PENALTY,
        },
    };

    const jsonBody = JSON.stringify(body);

    console.log(`🚀 Submitting query to URL: ${url}`);
    console.log(`📝 Request body: ${jsonBody}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'apikey': API_KEY,
            'Content-Type': 'application/json'
        },
        body: jsonBody
    });

    console.log();

    if (RESPONSE_MODE === "sync") {
        if (response.status === 200) {
            const original = await response.json();

            // Append context metadata at the end
            if (original.data) {
                original.data.contextMetadata = contextMetadata;
            }

            const final = JSON.stringify(original, null, 2);
            console.log("✅ Final Response (with contextMetadata appended):");
            console.log(final);
        } else {
            const respBody = await response.text();
            console.log(`❌ Error submitting sync query: ${response.status} - ${respBody}`);
        }
    } else if (RESPONSE_MODE === "stream") {
        console.log("✅ Streaming Response...");

        if (!response.body) {
            console.log("❌ No response body for streaming.");
            return;
        }

        let fullAnswer = "";
        let finalSessionId = "";
        let finalMessageId = "";
        let metrics = {};

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        async function read() {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith("data:")) {
                    const dataStr = line.slice(5).trim();

                    if (dataStr === "[DONE]") {
                        return;
                    }

                    try {
                        const event = JSON.parse(dataStr);
                        if (event.eventType === "fulfillment") {
                            if (event.answer) {
                                fullAnswer += event.answer;
                            }
                            if (event.sessionId) {
                                finalSessionId = event.sessionId;
                            }
                            if (event.messageId) {
                                finalMessageId = event.messageId;
                            }
                        } else if (event.eventType === "metricsLog") {
                            if (event.publicMetrics) {
                                metrics = event.publicMetrics;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            await read();
        }

        await read();

        const finalResponse = {
            message: "Chat query submitted successfully",
            data: {
                sessionId: finalSessionId,
                messageId: finalMessageId,
                answer: fullAnswer,
                metrics: metrics,
                status: "completed",
                contextMetadata: contextMetadata,
            },
        };

        const formatted = JSON.stringify(finalResponse, null, 2);
        console.log("\n✅ Final Response (with contextMetadata appended):");
        console.log(formatted);
    }
}

main().catch(console.error);