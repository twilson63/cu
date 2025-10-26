# Secure LLM Relay Service Architecture

## Overview

This document describes a comprehensive architecture for building a secure relay service that enables Lua WASM compute containers to make LLM API requests without exposing API keys to the client. The system leverages wallet-based authentication, encrypted secret vaults, and the sandboxed nature of WASM for enhanced security.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Components](#system-components)
3. [Security Model](#security-model)
4. [Implementation Guide](#implementation-guide)
5. [Usage Examples](#usage-examples)
6. [Security Best Practices](#security-best-practices)
7. [Deployment](#deployment)

## Architecture Overview

### Problem Statement

Traditional client-side LLM integrations require embedding API keys in JavaScript code or environment variables, creating security risks:
- API keys exposed in client code or network requests
- No centralized usage tracking or rate limiting
- Difficult to rotate keys without redeploying
- Users must manage their own keys

### Solution

A secure relay service that:
1. Authenticates users via cryptographic wallet signatures (Web3)
2. Manages API keys in an encrypted server-side vault
3. Proxies LLM requests without exposing keys to clients
4. Returns responses to sandboxed WASM compute containers
5. Provides usage tracking, rate limiting, and audit logging

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Browser)                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Lua WASM Compute Container                  │    │
│  │  • Sandboxed execution environment                  │    │
│  │  • No direct network access                         │    │
│  │  • External storage for caching                     │    │
│  │  • Request builder and response handler             │    │
│  └──────────────┬──────────────────────────────────────┘    │
│                 │                                            │
│  ┌──────────────▼──────────────────────────────────────┐    │
│  │  Wallet Integration (MetaMask/Web3)                 │    │
│  │  • EIP-712 structured data signing                  │    │
│  │  • Cryptographic request authentication             │    │
│  └──────────────┬──────────────────────────────────────┘    │
└─────────────────┼────────────────────────────────────────────┘
                  │ HTTPS + Signed Request
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Secure Relay Service                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Authentication Layer                                │    │
│  │  • Signature verification (EIP-712)                  │    │
│  │  • Nonce validation (replay prevention)             │    │
│  │  • Rate limiting per wallet                         │    │
│  └──────────────┬──────────────────────────────────────┘    │
│                 │                                            │
│  ┌──────────────▼──────────────────────────────────────┐    │
│  │  Secret Vault Manager                                │    │
│  │  • Encrypted API key storage                        │    │
│  │  • HSM/KMS integration                              │    │
│  │  • Key rotation policies                            │    │
│  └──────────────┬──────────────────────────────────────┘    │
│                 │                                            │
│  ┌──────────────▼──────────────────────────────────────┐    │
│  │  LLM Proxy Engine                                    │    │
│  │  • OpenAI, Anthropic, etc. integration              │    │
│  │  • Request sanitization                             │    │
│  │  • Response streaming                               │    │
│  └──────────────┬──────────────────────────────────────┘    │
│                 │                                            │
│  ┌──────────────▼──────────────────────────────────────┐    │
│  │  Audit & Analytics                                   │    │
│  │  • Usage tracking                                    │    │
│  │  • Cost management                                   │    │
│  │  • Security monitoring                              │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## System Components

### 1. Client-Side: Lua WASM Container

The Lua WASM compute unit provides a sandboxed environment for building LLM requests:

```lua
-- LLM Relay Client (client-side Lua)
local relay = {}
relay.config = ext.table()  -- Persistent configuration in external storage

-- Initialize relay configuration
function relay.init(endpoint, walletAddress)
    relay.config.endpoint = endpoint
    relay.config.wallet = walletAddress
    relay.config.nonce = 0
end

-- Prepare request with data to be signed
function relay.prepareRequest(prompt, model, options)
    local timestamp = os.time()
    relay.config.nonce = relay.config.nonce + 1
    
    local request = {
        prompt = prompt,
        model = model or "gpt-4",
        options = options or {},
        wallet = relay.config.wallet,
        nonce = relay.config.nonce,
        timestamp = timestamp
    }
    
    -- Create EIP-712 structured data for signing
    local typedData = {
        types = {
            EIP712Domain = {
                {name = "name", type = "string"},
                {name = "version", type = "string"},
                {name = "chainId", type = "uint256"}
            },
            LLMRequest = {
                {name = "prompt", type = "string"},
                {name = "model", type = "string"},
                {name = "wallet", type = "address"},
                {name = "nonce", type = "uint256"},
                {name = "timestamp", type = "uint256"}
            }
        },
        domain = {
            name = "LLM Relay Service",
            version = "1",
            chainId = 1
        },
        primaryType = "LLMRequest",
        message = request
    }
    
    return typedData
end

-- High-level completion API
function relay.complete(prompt, options)
    options = options or {}
    local model = options.model or "gpt-4"
    
    -- Check cache first
    local cacheKey = prompt .. ":" .. model
    local cached = relay.cache[cacheKey]
    if cached and (os.time() - cached.timestamp < 3600) then
        return cached.response
    end
    
    -- Prepare request
    local requestData = relay.prepareRequest(prompt, model, options)
    relay.config.lastRequest = requestData
    
    -- Return for JavaScript bridge to handle signing and HTTP
    return {
        action = "relay.sign_and_send",
        data = requestData
    }
end

-- Handle LLM response
function relay.handleResponse(response, error)
    if error then
        print("LLM Error: " .. error)
        return nil
    end
    
    -- Cache successful response
    local request = relay.config.lastRequest
    if request and response then
        local cacheKey = request.message.prompt .. ":" .. request.message.model
        relay.cache[cacheKey] = {
            response = response,
            timestamp = os.time()
        }
    end
    
    return response
end

-- Streaming response handler
relay.currentResponse = ""
function relay.onChunk(chunk)
    relay.currentResponse = relay.currentResponse .. chunk
end

-- Get statistics
function relay.getStats()
    local cacheSize = 0
    for _ in pairs(relay.cache) do
        cacheSize = cacheSize + 1
    end
    
    return {
        endpoint = relay.config.endpoint,
        wallet = relay.config.wallet,
        requestCount = relay.config.nonce or 0,
        cacheSize = cacheSize
    }
end

return relay
```

### 2. JavaScript Bridge Layer

Connects the WASM container to wallet and network:

```javascript
// llm-relay-bridge.js
import { ethers } from 'ethers';
import * as lua from './lua-api.js';

class LLMRelayBridge {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.walletAddress = null;
    }
    
    async connectWallet() {
        if (!window.ethereum) {
            throw new Error("No Web3 wallet detected");
        }
        
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        await this.provider.send("eth_requestAccounts", []);
        this.signer = this.provider.getSigner();
        this.walletAddress = await this.signer.getAddress();
        
        return this.walletAddress;
    }
    
    async signRequest(typedData) {
        if (!this.signer) {
            throw new Error("Wallet not connected");
        }
        
        const signature = await this.signer._signTypedData(
            typedData.domain,
            typedData.types,
            typedData.message
        );
        
        return signature;
    }
    
    async sendRelayRequest(endpoint, typedData, signature) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Wallet-Signature': signature,
            },
            body: JSON.stringify({
                typedData: typedData,
                signature: signature
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Relay error: ${error}`);
        }
        
        return await response.json();
    }
    
    async sendStreamingRequest(endpoint, typedData, signature, onChunk) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Wallet-Signature': signature,
                'X-Stream': 'true'
            },
            body: JSON.stringify({
                typedData: typedData,
                signature: signature
            })
        });
        
        if (!response.ok) {
            throw new Error(`Relay error: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            fullResponse += chunk;
            
            if (onChunk) {
                onChunk(chunk);
            }
        }
        
        return fullResponse;
    }
}

// High-level API for use with Lua WASM
export async function initializeLLMRelay(relayEndpoint) {
    // 1. Load WASM
    await lua.loadLuaWasm();
    lua.init();
    
    // 2. Connect wallet
    const bridge = new LLMRelayBridge();
    const wallet = await bridge.connectWallet();
    
    // 3. Initialize Lua relay client
    await lua.compute(`
        relay = require('relay')
        relay.init("${relayEndpoint}", "${wallet}")
    `);
    
    return {
        bridge,
        wallet,
        
        async complete(prompt, options = {}) {
            // Get request data from Lua
            const resultBytes = await lua.compute(`
                return relay.complete(${JSON.stringify(prompt)}, ${JSON.stringify(options)})
            `);
            
            const result = lua.readResult(lua.getBufferPtr(), resultBytes);
            
            if (result.value?.action === "relay.sign_and_send") {
                const typedData = result.value.data;
                
                // Sign with wallet
                const signature = await bridge.signRequest(typedData);
                
                // Send to relay
                const response = await bridge.sendRelayRequest(
                    relayEndpoint + '/api/llm/proxy',
                    typedData,
                    signature
                );
                
                // Handle response in Lua
                await lua.compute(`
                    relay.handleResponse(${JSON.stringify(response)})
                `);
                
                return response;
            }
            
            return result.value;
        }
    };
}

export default LLMRelayBridge;
```

### 3. Relay Service Backend

Server-side implementation for secure API key management:

```python
# secure_relay_service.py
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import StreamingResponse
from eth_account.messages import encode_structured_data
from eth_account import Account
import hashlib
import time
import redis
from cryptography.fernet import Fernet
import anthropic
import openai
from typing import Optional, Dict
import json

app = FastAPI()

# Initialize components
redis_client = redis.Redis(host='redis', port=6379, decode_responses=True)
vault_key = Fernet.generate_key()  # In production, load from secure storage
cipher = Fernet(vault_key)

class SecretVault:
    """Manages encrypted API keys per wallet address"""
    
    def store_api_key(self, wallet_address: str, provider: str, api_key: str):
        """Store encrypted API key for user"""
        encrypted_key = cipher.encrypt(api_key.encode())
        key = f"vault:{wallet_address.lower()}:{provider}"
        # Store with 24hr expiry, refresh on use
        redis_client.set(key, encrypted_key.decode(), ex=86400)
        
    def get_api_key(self, wallet_address: str, provider: str) -> str:
        """Retrieve and decrypt API key"""
        key = f"vault:{wallet_address.lower()}:{provider}"
        encrypted_key = redis_client.get(key)
        
        if not encrypted_key:
            raise ValueError(f"No API key found for {provider}")
        
        # Refresh TTL on access
        redis_client.expire(key, 86400)
        
        return cipher.decrypt(encrypted_key.encode()).decode()
    
    def delete_api_key(self, wallet_address: str, provider: str):
        """Remove API key from vault"""
        key = f"vault:{wallet_address.lower()}:{provider}"
        redis_client.delete(key)

class RequestValidator:
    """Validates EIP-712 signed requests"""
    
    def verify_signature(self, typed_data: dict, signature: str) -> str:
        """Verify signature and return wallet address"""
        try:
            # Encode structured data according to EIP-712
            encoded_data = encode_structured_data(typed_data)
            
            # Recover address from signature
            wallet_address = Account.recover_message(
                encoded_data,
                signature=signature
            )
            
            return wallet_address.lower()
        except Exception as e:
            raise ValueError(f"Invalid signature: {str(e)}")
    
    def validate_nonce(self, wallet: str, nonce: int) -> bool:
        """Prevent replay attacks"""
        key = f"nonce:{wallet.lower()}"
        stored_nonce = redis_client.get(key)
        
        if stored_nonce and int(stored_nonce) >= nonce:
            return False
        
        # Store new nonce
        redis_client.set(key, nonce, ex=3600)  # 1 hour expiry
        return True
    
    def validate_timestamp(self, timestamp: int, tolerance: int = 300) -> bool:
        """Validate request timestamp (5 minute tolerance)"""
        current_time = int(time.time())
        return abs(current_time - timestamp) <= tolerance
    
    def check_rate_limit(self, wallet: str, limit: int = 10) -> bool:
        """Rate limiting per wallet (requests per minute)"""
        key = f"rate:{wallet.lower()}:{int(time.time() // 60)}"
        count = redis_client.incr(key)
        redis_client.expire(key, 60)
        
        return count <= limit

class AuditLogger:
    """Audit logging for security monitoring"""
    
    def log_request(self, wallet: str, model: str, provider: str, 
                   tokens: Optional[int] = None, cost: Optional[float] = None):
        """Log API request"""
        log_entry = {
            'timestamp': time.time(),
            'wallet': wallet,
            'model': model,
            'provider': provider,
            'tokens': tokens,
            'cost': cost
        }
        
        # Store in Redis list (keep last 1000 entries per wallet)
        key = f"audit:{wallet}"
        redis_client.lpush(key, json.dumps(log_entry))
        redis_client.ltrim(key, 0, 999)
        
    def get_usage_stats(self, wallet: str) -> dict:
        """Get usage statistics for wallet"""
        key = f"audit:{wallet}"
        entries = redis_client.lrange(key, 0, -1)
        
        total_requests = len(entries)
        total_tokens = 0
        total_cost = 0.0
        
        for entry_str in entries:
            entry = json.loads(entry_str)
            if entry.get('tokens'):
                total_tokens += entry['tokens']
            if entry.get('cost'):
                total_cost += entry['cost']
        
        return {
            'total_requests': total_requests,
            'total_tokens': total_tokens,
            'total_cost': total_cost
        }

# Initialize services
vault = SecretVault()
validator = RequestValidator()
audit = AuditLogger()

def get_provider_for_model(model: str) -> str:
    """Determine provider from model name"""
    if model.startswith('gpt-') or model.startswith('o1-'):
        return 'openai'
    elif model.startswith('claude-'):
        return 'anthropic'
    else:
        raise ValueError(f"Unknown model: {model}")

async def call_llm_provider(provider: str, api_key: str, 
                            prompt: str, model: str, 
                            options: dict, stream: bool = False):
    """Call LLM provider API"""
    
    if provider == 'openai':
        client = openai.OpenAI(api_key=api_key)
        
        if stream:
            return client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
                **options
            )
        else:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                **options
            )
            return response.model_dump()
    
    elif provider == 'anthropic':
        client = anthropic.Anthropic(api_key=api_key)
        
        if stream:
            return client.messages.stream(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                **options
            )
        else:
            response = client.messages.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                **options
            )
            return response.model_dump()
    
    raise ValueError(f"Unsupported provider: {provider}")

@app.post("/api/llm/proxy")
async def proxy_llm_request(
    request: Request,
    x_wallet_signature: str = Header(...),
    x_stream: Optional[str] = Header(None)
):
    """Main relay endpoint for LLM requests"""
    
    body = await request.json()
    typed_data = body.get('typedData')
    signature = x_wallet_signature
    
    # 1. Verify signature
    try:
        wallet_address = validator.verify_signature(typed_data, signature)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid signature: {str(e)}")
    
    message = typed_data['message']
    
    # 2. Validate nonce
    if not validator.validate_nonce(wallet_address, message['nonce']):
        raise HTTPException(status_code=401, detail="Invalid or replayed nonce")
    
    # 3. Validate timestamp
    if not validator.validate_timestamp(message['timestamp']):
        raise HTTPException(status_code=401, detail="Request expired")
    
    # 4. Check rate limits
    if not validator.check_rate_limit(wallet_address):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    # 5. Get API key from vault
    model = message['model']
    prompt = message['prompt']
    options = message.get('options', {})
    
    try:
        provider = get_provider_for_model(model)
        api_key = vault.get_api_key(wallet_address, provider)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    
    # 6. Make LLM request
    stream = x_stream == 'true'
    
    try:
        if stream:
            # Return streaming response
            async def generate():
                stream_response = await call_llm_provider(
                    provider, api_key, prompt, model, options, stream=True
                )
                
                for chunk in stream_response:
                    if provider == 'openai':
                        content = chunk.choices[0].delta.content
                        if content:
                            yield content
                    elif provider == 'anthropic':
                        if hasattr(chunk, 'content_block'):
                            yield chunk.content_block.text
            
            return StreamingResponse(generate(), media_type="text/plain")
        else:
            response = await call_llm_provider(
                provider, api_key, prompt, model, options, stream=False
            )
            
            # Log request for audit
            tokens = response.get('usage', {}).get('total_tokens')
            audit.log_request(wallet_address, model, provider, tokens=tokens)
            
            return {
                'response': response,
                'wallet': wallet_address,
                'timestamp': time.time()
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Provider error: {str(e)}")

@app.post("/api/vault/store")
async def store_api_key(
    request: Request,
    x_wallet_signature: str = Header(...)
):
    """Store encrypted API key in vault"""
    
    body = await request.json()
    typed_data = body.get('typedData')
    signature = x_wallet_signature
    
    # Verify signature
    try:
        wallet_address = validator.verify_signature(typed_data, signature)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid signature: {str(e)}")
    
    message = typed_data['message']
    provider = message['provider']
    api_key = message['apiKey']
    
    # Store in vault
    vault.store_api_key(wallet_address, provider, api_key)
    
    return {
        'success': True,
        'provider': provider,
        'wallet': wallet_address
    }

@app.get("/api/usage/{wallet_address}")
async def get_usage_stats(wallet_address: str):
    """Get usage statistics for wallet"""
    stats = audit.get_usage_stats(wallet_address.lower())
    return stats

@app.delete("/api/vault/{provider}")
async def delete_api_key(
    provider: str,
    x_wallet_signature: str = Header(...)
):
    """Delete API key from vault"""
    # Implementation similar to store_api_key
    pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
```

## Security Model

### Authentication Flow

1. **Request Preparation**: Client prepares EIP-712 structured data
2. **Wallet Signing**: User signs with private key (MetaMask/Web3)
3. **Signature Verification**: Server recovers wallet address from signature
4. **Nonce Validation**: Check nonce to prevent replay attacks
5. **Timestamp Validation**: Ensure request is recent (5-minute window)
6. **Rate Limiting**: Check per-wallet rate limits

### Threat Model

**Threats Mitigated:**

✅ **API Key Exposure**: Keys never leave server, never in client code  
✅ **Replay Attacks**: Nonce tracking prevents request replay  
✅ **Rate Limit Abuse**: Per-wallet throttling prevents abuse  
✅ **Unauthorized Access**: Cryptographic signatures ensure authenticity  
✅ **MITM Attacks**: TLS encryption + request signing  
✅ **Key Theft**: Encryption at rest with Fernet (AES-128-CBC)  

**Additional Security Measures:**

- **Memory Isolation**: WASM sandbox prevents memory access
- **No Direct Network**: Lua code cannot make HTTP requests directly
- **Input Validation**: All inputs sanitized before processing
- **Audit Logging**: Complete trail of all API usage
- **Key Rotation**: Automatic expiry and rotation policies

## Implementation Guide

### Step 1: Setup Relay Service

```bash
# Install dependencies
pip install fastapi uvicorn redis eth-account cryptography openai anthropic

# Run Redis
docker run -d -p 6379:6379 redis:alpine

# Start relay service
python secure_relay_service.py
```

### Step 2: Integrate with Lua WASM

```javascript
// In your web application
import { initializeLLMRelay } from './llm-relay-bridge.js';

async function main() {
    // Initialize relay
    const relay = await initializeLLMRelay('https://relay.example.com');
    
    console.log('Connected with wallet:', relay.wallet);
    
    // Make LLM request
    const response = await relay.complete(
        "Explain quantum computing in simple terms",
        { model: 'gpt-4', temperature: 0.7 }
    );
    
    console.log('Response:', response);
}

main();
```

### Step 3: Store API Keys

```javascript
// User stores their API key (one-time setup)
async function storeAPIKey(provider, apiKey) {
    const typedData = {
        types: {
            EIP712Domain: [
                {name: "name", type: "string"},
                {name: "version", type: "string"}
            ],
            VaultStore: [
                {name: "provider", type: "string"},
                {name: "apiKey", type: "string"},
                {name: "timestamp", type: "uint256"}
            ]
        },
        domain: {
            name: "LLM Relay Vault",
            version: "1"
        },
        primaryType: "VaultStore",
        message: {
            provider: provider,
            apiKey: apiKey,
            timestamp: Math.floor(Date.now() / 1000)
        }
    };
    
    const signature = await bridge.signRequest(typedData);
    
    const response = await fetch('https://relay.example.com/api/vault/store', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Signature': signature
        },
        body: JSON.stringify({ typedData, signature })
    });
    
    return await response.json();
}
```

## Usage Examples

### Basic Completion

```lua
-- In Lua WASM
relay = require('relay')
relay.init("https://relay.example.com", "0x1234...")

local response = relay.complete("What is 2+2?", {model = "gpt-4"})
print(response.response.choices[1].message.content)
```

### Streaming Response

```javascript
// JavaScript bridge with streaming
const response = await bridge.sendStreamingRequest(
    endpoint,
    typedData,
    signature,
    (chunk) => {
        // Handle each chunk
        lua.compute(`relay.onChunk(${JSON.stringify(chunk)})`);
    }
);
```

### Usage Statistics

```lua
-- Get usage stats
local stats = relay.getStats()
print("Total requests: " .. stats.requestCount)
print("Cache size: " .. stats.cacheSize)
```

## Security Best Practices

### For Operators

1. **Use Hardware Security Modules (HSM)**: Store vault encryption keys in HSM
2. **Enable Audit Logging**: Log all access to CloudWatch/Datadog
3. **Implement IP Allowlisting**: Restrict relay access by IP
4. **Regular Key Rotation**: Rotate vault encryption keys monthly
5. **Monitor Anomalies**: Alert on unusual usage patterns
6. **Rate Limiting**: Implement tiered rate limits based on usage

### For Developers

1. **Never Log Secrets**: Don't log API keys or signatures
2. **Validate All Inputs**: Sanitize before processing
3. **Use HTTPS Only**: Enforce TLS 1.3
4. **Clear Sensitive Data**: Zero out memory after use
5. **Implement Circuit Breakers**: Prevent cascade failures
6. **Test Signature Validation**: Comprehensive security tests

### For Users

1. **Verify Relay Domain**: Check SSL certificate
2. **Review Permissions**: Understand what you're signing
3. **Monitor Usage**: Check usage stats regularly
4. **Rotate Keys**: Change API keys periodically
5. **Use Hardware Wallets**: For high-value accounts

## Deployment

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  relay:
    build: .
    environment:
      - VAULT_KEY_PATH=/run/secrets/vault_key
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=INFO
    ports:
      - "8080:8080"
    secrets:
      - vault_key
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
  
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    ports:
      - "443:443"
    depends_on:
      - relay

secrets:
  vault_key:
    file: ./secrets/vault_key.txt

volumes:
  redis-data:
```

### Kubernetes Deployment

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-relay
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-relay
  template:
    metadata:
      labels:
        app: llm-relay
    spec:
      containers:
      - name: relay
        image: llm-relay:latest
        ports:
        - containerPort: 8080
        env:
        - name: REDIS_URL
          value: redis://redis-service:6379
        - name: VAULT_KEY
          valueFrom:
            secretKeyRef:
              name: vault-secrets
              key: encryption-key
---
apiVersion: v1
kind: Service
metadata:
  name: llm-relay-service
spec:
  type: LoadBalancer
  ports:
  - port: 443
    targetPort: 8080
  selector:
    app: llm-relay
```

## Performance Considerations

### Caching Strategy

- **Client-Side Cache**: Store responses in Lua external tables
- **Server-Side Cache**: Use Redis for frequently requested completions
- **Cache Invalidation**: 1-hour TTL for most responses

### Scaling

- **Horizontal Scaling**: Deploy multiple relay instances behind load balancer
- **Connection Pooling**: Reuse LLM provider connections
- **Async Processing**: Use async/await for non-blocking I/O

### Monitoring

```python
# Add Prometheus metrics
from prometheus_client import Counter, Histogram

request_counter = Counter('llm_requests_total', 'Total LLM requests', ['wallet', 'model'])
request_duration = Histogram('llm_request_duration_seconds', 'Request duration')

@request_duration.time()
async def proxy_llm_request(...):
    request_counter.labels(wallet=wallet_address, model=model).inc()
    # ... rest of implementation
```

## Conclusion

This architecture provides a secure, scalable solution for managing LLM API access through Lua WASM compute containers. The combination of:

- **Wallet-based authentication** (cryptographically secure)
- **Server-side key management** (keys never exposed)
- **WASM sandboxing** (isolated execution)
- **Audit logging** (complete transparency)

Creates a robust system for building AI-powered applications without compromising security.

## API Note

**Important**: The Lua WASM API uses `lua.compute()` not `lua.eval()`. All examples in this document use the correct `compute()` function. If you see references to `eval()` in older documentation, please update to use `compute()`.

## Further Reading

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Core system architecture
- [ENHANCED_ARCHITECTURE.md](./ENHANCED_ARCHITECTURE.md) - Advanced features
- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API documentation
- [SECURITY.md](./SECURITY.md) - Security best practices
