"""Zero-dependency Python adapter example."""

import json
import time
import urllib.request
import uuid


def add_usage(input_tokens: int, output_tokens: int = 0, cache_read_tokens: int = 0) -> dict:
    payload = {
        "schema": "deepseek-token-pet/event@1",
        "id": f"python:{uuid.uuid4()}",
        "timestamp": int(time.time() * 1000),
        "source": "python-client",
        "type": "usage",
        "mode": "delta",
        "usage": {
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "cacheReadTokens": cache_read_tokens,
        },
    }
    request = urllib.request.Request(
        "http://127.0.0.1:47832/v1/events",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)


if __name__ == "__main__":
    print(add_usage(500_000, cache_read_tokens=500_000))

