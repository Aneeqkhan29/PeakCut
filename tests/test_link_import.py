"""Boundary and cleanup checks for the public video-link importer."""
import sys
import os
import io
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi.testclient import TestClient
from api.link import app, normalize_url


class LinkImportTests(unittest.TestCase):
    def test_private_backend_requires_key_before_any_download(self):
        with patch.dict(os.environ, {'PEAKCUT_LINK_REQUIRE_KEY':'1','PEAKCUT_LINK_BACKEND_KEY':'test-only-key'}), TestClient(app) as client, patch('api.link.download_video') as download:
            response = client.post('/api/link', json={'url':'https://youtu.be/jNQXAC9IVRw'})
            self.assertEqual(response.status_code, 401)
            download.assert_not_called()

    def test_upstream_proxy_forwards_only_the_normalized_link(self):
        response = io.BytesIO(b'test video')
        response.headers = {'content-type':'video/mp4', 'content-length':'10'}
        with patch.dict(os.environ, {'PEAKCUT_LINK_UPSTREAM':'https://download.example','PEAKCUT_LINK_BACKEND_KEY':'test-only-key'}), TestClient(app) as client, patch('api.link.urllib.request.urlopen', return_value=response) as remote:
            result = client.post('/api/link', json={'url':'https://youtu.be/jNQXAC9IVRw?t=5'})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.content, b'test video')
            sent = remote.call_args.args[0]
            self.assertEqual(sent.full_url, 'https://download.example/api/link')
            self.assertIn(b'https://www.youtube.com/watch?v=jNQXAC9IVRw', sent.data)
            self.assertEqual(sent.get_header('X-peakcut-backend-key'), 'test-only-key')
            self.assertTrue(response.closed)

    def test_normalizes_supported_video_links(self):
        wanted = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
        for value in [wanted + '&list=ignored', 'https://youtu.be/jNQXAC9IVRw?t=3',
                      'https://www.youtube.com/shorts/jNQXAC9IVRw']:
            self.assertEqual(normalize_url(value), wanted)
        self.assertEqual(normalize_url('https://clips.twitch.tv/ExampleClip'), 'https://clips.twitch.tv/ExampleClip')
        self.assertEqual(normalize_url('https://www.twitch.tv/videos/1234567?t=1m'), 'https://www.twitch.tv/videos/1234567')

    def test_rejects_arbitrary_hosts_credentials_ports_and_non_video_urls(self):
        for value in [None, [], 'http://localhost/', 'https://127.0.0.1/',
                      'https://youtube.com.evil.example/watch?v=jNQXAC9IVRw',
                      'https://user:password@youtube.com/watch?v=jNQXAC9IVRw',
                      'https://youtube.com:8443/watch?v=jNQXAC9IVRw',
                      'https://youtube.com/redirect?q=https://127.0.0.1/',
                      'https://youtube.com/playlist?list=abc', 'https://twitch.tv/channel',
                      'file:///etc/passwd', 'https://clips.twitch.tv/../anything']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_url(value)

    def test_bad_requests_never_reach_downloader(self):
        with TestClient(app) as client, patch('api.link.download_video') as download:
            self.assertEqual(client.post('/api/link', json={'url':'https://127.0.0.1/'}).status_code, 400)
            self.assertEqual(client.post('/api/link', content=b'not json').status_code, 400)
            self.assertEqual(client.post('/api/link', content=b'x'*5000).status_code, 413)
            self.assertEqual(client.post('/api/link', json={'url':'https://youtu.be/jNQXAC9IVRw'}, headers={'Origin':'https://another.example'}).status_code, 403)
            download.assert_not_called()

    def test_stream_cleanup_and_platform_refusal(self):
        folders = []

        def write_fixture(url, folder):
            folders.append(folder)
            result = folder / 'source.mp4'
            result.write_bytes(b'test video stream')
            return result

        with TestClient(app) as client, patch('api.link.download_video', side_effect=write_fixture):
            response = client.post('/api/link', json={'url':'https://youtu.be/jNQXAC9IVRw'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content, b'test video stream')
            self.assertEqual(response.headers['cache-control'], 'private, no-store')
            self.assertTrue(all(not folder.exists() for folder in folders))
        with TestClient(app) as client, patch('api.link.download_video', side_effect=RuntimeError('Sign in to confirm you are not a bot')):
            response = client.post('/api/link', json={'url':'https://youtu.be/jNQXAC9IVRw'})
            self.assertEqual(response.status_code, 422)
            self.assertIn('hosting server', response.json()['detail'])


if __name__ == '__main__':
    unittest.main()
