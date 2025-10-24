#!/usr/bin/env python3
"""
Simple Lua execution server
Provides /api/lua endpoint for executing Lua code
"""

import json
import subprocess
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

class LuaHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/lua':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                data = json.loads(body)
                code = data.get('code', '')
                
                # Execute Lua code
                try:
                    result = subprocess.run(
                        ['lua', '-e', code],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    
                    output = result.stdout if result.returncode == 0 else result.stderr
                    status = 200
                except subprocess.TimeoutExpired:
                    output = "Error: Execution timeout"
                    status = 408
                except FileNotFoundError:
                    output = "Error: Lua not installed. Try: brew install lua"
                    status = 500
                except Exception as e:
                    output = f"Error: {str(e)}"
                    status = 500
                
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                response = json.dumps({'result': output, 'status': status})
                self.wfile.write(response.encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_GET(self):
        # Serve static files
        if self.path == '/' or self.path == '':
            self.path = '/index.html'
        
        filepath = os.path.join(os.path.dirname(__file__), self.path.lstrip('/'))
        
        if os.path.isfile(filepath):
            with open(filepath, 'rb') as f:
                self.send_response(200)
                if filepath.endswith('.html'):
                    self.send_header('Content-Type', 'text/html')
                elif filepath.endswith('.js'):
                    self.send_header('Content-Type', 'application/javascript')
                elif filepath.endswith('.wasm'):
                    self.send_header('Content-Type', 'application/wasm')
                self.end_headers()
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        # Suppress logs
        pass

if __name__ == '__main__':
    server = HTTPServer(('localhost', 8000), LuaHandler)
    print('🚀 Lua WASM Server running on http://localhost:8000')
    print('   Lua execution backend: Available')
    server.serve_forever()
