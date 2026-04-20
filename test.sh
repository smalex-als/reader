curl -s -X POST 'http://localhost:3001/api/stream-audio/wav-stream' \
    -H 'Content-Type: application/json' \
    --data-binary @- <<'EOF' | ffplay -autoexit -
{"voice":"alloy","text":"This is a long streaming audio test. We want to confirm that playback begins before the server finishes generating the
full audio. The text should be long enough that the difference is obvious. Keep listening for several sentences. If playback starts almost
immediately while the request is still active, then the backend is really streaming wav data instead of waiting for the complete file. We can
continue with more content to make the behavior easier to observe. Here is another paragraph. Streaming should continue smoothly as more audio
arrives. The player should not need to wait for the final byte of the response before starting playback. This is the key thing we want to verify.
If you hear this early, then the endpoint is working as a progressive stream. We can add even more text to extend the duration. The quick brown
fox jumps over the lazy dog. System design interviews often discuss queues, caches, sharding, load balancers, replication, consistency, and
failure modes. Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do. This should be enough for
a practical test of streaming wav playback."}
EOF

