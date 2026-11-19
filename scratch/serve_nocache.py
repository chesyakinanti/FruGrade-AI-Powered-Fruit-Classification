import http.server
import socketserver
import os

PORT = 4321

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    # Ensure serving from root project dir
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root_dir)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
        print(f"Serving at http://localhost:{PORT} with Cache-Control: no-cache disabled")
        httpd.serve_forever()
