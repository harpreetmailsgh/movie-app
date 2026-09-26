"""Expo GraphQL client authenticated with an EXPO_TOKEN (access token).

Same interface as the local-surrogate gql.py used on the dev machine:
exposes `gql(query, variables)` and `UA`. The token is passed as a
Bearer header, which is how EAS CLI itself authenticates to api.expo.dev.
"""
import json
import os
import urllib.error
import urllib.request

API = "https://api.expo.dev/graphql"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"


def gql(query, variables=None):
    token = os.environ.get("EXPO_TOKEN")
    if not token:
        raise RuntimeError("EXPO_TOKEN is not set")
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read()[:800].decode(errors="replace"))
        raise
    if data.get("errors"):
        print("GRAPHQL ERRORS:", json.dumps(data["errors"], indent=2)[:2000])
        raise RuntimeError("graphql errors")
    return data["data"]
