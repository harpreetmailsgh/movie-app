"""Publish an EAS Update for the movie-app project to Expo, per eas-cli's own flow.
Steps: compute asset hashes -> get signed upload specs -> upload -> poll -> publishUpdateGroups.
Token never touches this file: auth flows through gql.py, which reads
EXPO_TOKEN from the environment (Bearer header to api.expo.dev).
"""
import base64, hashlib, json, mimetypes, os, subprocess, sys, time, urllib.request, urllib.error
import gql as G

UA = G.UA
APP_ID = "646085b5-a3c9-4755-8dec-963c6f72223c"
BRANCH_ID = "01a0d51c-7676-7017-84e7-5921a2fb40e8"
RUNTIME_VERSION = os.environ.get("EAS_RUNTIME_VERSION", "exposdk:54.0.0")
PROJECT_DIR = os.path.expanduser(os.environ.get("EAS_PROJECT_DIR", "~/workspace/movie-app-eas"))
DIST_DIR = os.path.join(PROJECT_DIR, "dist")


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def file_sha256_b64url(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return b64url(h.digest())


def storage_key_for(content_type: str, file_sha256: str) -> str:
    """base64url key, matching eas-cli's getStorageKey (project/publish.js)."""
    h = hashlib.sha256((content_type + "\0" + file_sha256).encode())
    return b64url(h.digest())


def bundle_key_for(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def get_upload_specs(content_types):
    q = """
    mutation($assetContentTypes: [String]!) {
      asset {
        getSignedAssetUploadSpecifications(assetContentTypes: $assetContentTypes) {
          specifications
        }
      }
    }
    """
    d = G.gql(q, {"assetContentTypes": content_types})
    raw = d["asset"]["getSignedAssetUploadSpecifications"]["specifications"]
    # specs arrive as a list of JSON strings, aligned by index with the requested content types
    return [json.loads(s) for s in raw]


def multipart_post(url, fields, file_field_name, file_path, file_content_type):
    boundary = "----ExpoBoundary" + hashlib.md5(os.urandom(16)).hexdigest()
    body = b""
    for k, v in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode()
        body += f"{v}\r\n".encode()
    with open(file_path, "rb") as f:
        data = f.read()
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="{file_field_name}"; filename="{os.path.basename(file_path)}"\r\n'.encode()
    body += f"Content-Type: {file_content_type}\r\n\r\n".encode()
    body += data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}",
                                          "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.status, resp.read()[:200]


def existing_storage_keys(storage_keys):
    q = """
    query($storageKeys: [String!]!) {
      asset {
        metadata(storageKeys: $storageKeys) {
          storageKey
          status
        }
      }
    }
    """
    d = G.gql(q, {"storageKeys": storage_keys})
    return {i["storageKey"] for i in d["asset"]["metadata"] if i["status"] == "EXISTS"}


def upload_with_retry(url, fields, file_path, content_type, attempts=4):
    last_err = None
    for i in range(attempts):
        try:
            status, _ = multipart_post(url, fields, "file", file_path, content_type)
            return status
        except Exception as e:  # noqa: BLE001 - transient network failures
            last_err = e
            time.sleep(5 * (i + 1))
    raise last_err


def poll_metadata(storage_keys):
    q = """
    query($storageKeys: [String!]!) {
      asset {
        metadata(storageKeys: $storageKeys) {
          storageKey
          status
        }
      }
    }
    """
    deadline = time.time() + 600
    while time.time() < deadline:
        d = G.gql(q, {"storageKeys": storage_keys})
        items = d["asset"]["metadata"]
        pending = [i for i in items if i["status"] != "EXISTS"]
        if not pending:
            return True
        time.sleep(10)
    return False


def publish_update_group(update_info_group, message):
    q = """
    mutation($input: [PublishUpdateGroupInput!]!) {
      updateBranch {
        publishUpdateGroups(publishUpdateGroupsInput: $input) {
          ... on Update { id group }
        }
      }
    }
    """
    d = G.gql(q, {"input": [{
        "branchId": BRANCH_ID,
        "runtimeVersion": RUNTIME_VERSION,
        "updateInfoGroup": update_info_group,
        "message": message,
    }]})
    return d["updateBranch"]["publishUpdateGroups"]


def main():
    meta_path = os.path.join(DIST_DIR, "metadata.json")
    with open(meta_path) as f:
        meta = json.load(f)
    file_meta = meta["fileMetadata"]["ios"]

    # ---- launch asset (bundle): metadata.json gives a plain path string ----
    bundle_path = os.path.join(DIST_DIR, file_meta["bundle"])
    bundle_ct = "application/javascript"
    bundle_entry = {
        "fileSHA256": file_sha256_b64url(bundle_path),
        "contentType": bundle_ct,
        "fileExtension": ".bundle",
    }
    bundle_entry["storageKey"] = storage_key_for(bundle_ct, bundle_entry["fileSHA256"])
    bundle_entry["bundleKey"] = bundle_key_for(bundle_path)

    # ---- assets ----
    asset_entries = []
    seen_paths = set()
    for a in file_meta.get("assets", []):
        apath = os.path.join(DIST_DIR, a["path"])
        if apath in seen_paths:
            continue
        seen_paths.add(apath)
        ext = (a.get("ext") or os.path.splitext(apath)[1].lstrip(".")).lstrip(".")
        ct = mimetypes.guess_type("x." + ext)[0] or "application/octet-stream"
        e = {
            "fileSHA256": file_sha256_b64url(apath),
            "contentType": ct,
            "fileExtension": "." + ext,
            "path": apath,
        }
        e["storageKey"] = storage_key_for(ct, e["fileSHA256"])
        e["bundleKey"] = bundle_key_for(apath)
        asset_entries.append(e)

    all_entries = [dict(bundle_entry, path=bundle_path)] + asset_entries
    content_types = [e["contentType"] for e in all_entries]
    print(f"bundle + {len(asset_entries)} assets; requesting upload specs...", flush=True)
    specs = get_upload_specs(content_types)
    print(f"got {len(specs)} specs", flush=True)
    # storageKey is content-derived (base64url, eas-cli getStorageKey); the
    # spec's fields.key is only the transient GCS object name. Keep ours.
    for e, spec in zip(all_entries, specs):
        assert spec.get("url"), f"missing upload url for {os.path.basename(e['path'])}"

    storage_keys = [e["storageKey"] for e in all_entries]
    print("checking which assets already exist...", flush=True)
    existing = existing_storage_keys(storage_keys)
    print(f"{len(existing)}/{len(storage_keys)} already exist", flush=True)

    for e, spec in zip(all_entries, specs):
        if e["storageKey"] in existing:
            print(f"skip upload (exists): {os.path.basename(e['path'])}", flush=True)
            continue
        url = spec["url"]
        form = spec.get("fields", {})
        status = upload_with_retry(url, form, e["path"], e["contentType"])
        print(f"uploaded {os.path.basename(e['path'])} -> {status}", flush=True)

    print("polling asset metadata...", flush=True)
    ok = poll_metadata(storage_keys)
    if not ok:
        print("ASSETS NOT READY after 10 min")
        sys.exit(1)
    print("all assets exist")

    with open(os.path.join(PROJECT_DIR, "app.json")) as f:
        expo_config = json.load(f)["expo"]

    # eas-cli publishes the RESOLVED expo config (via @expo/config), which fills
    # in sdkVersion from the installed expo package. Expo Go REQUIRES
    # extra.expoClient.sdkVersion in the manifest (its SDK-compatibility check
    # reads exactly that field) and rejects the update with
    # "Incompatible SDK version or no SDK version specified" when it's missing.
    if not expo_config.get("sdkVersion"):
        sdk_v = None
        try:
            out = subprocess.run(
                ["node", "-e",
                 "const {getConfig}=require('@expo/config');"
                 "console.log(getConfig(process.cwd(),{skipSDKVersionRequirement:true}).exp.sdkVersion||'')"],
                cwd=PROJECT_DIR, capture_output=True, text=True, timeout=60)
            sdk_v = out.stdout.strip() or None
        except Exception:
            pass
        if not sdk_v:
            try:
                with open(os.path.join(PROJECT_DIR, "node_modules", "expo", "package.json")) as f:
                    sdk_v = json.load(f)["version"]
            except Exception:
                pass
        if sdk_v:
            expo_config["sdkVersion"] = sdk_v
            print(f"injected expoClient.sdkVersion={sdk_v}", flush=True)

    def pub(e):
        return {"fileSHA256": e["fileSHA256"], "bundleKey": e["bundleKey"],
                "storageKey": e["storageKey"], "contentType": e["contentType"],
                "fileExtension": e["fileExtension"]}

    update_info_group = {
        "ios": {
            "launchAsset": pub(bundle_entry),
            "assets": [pub(e) for e in asset_entries],
            "extra": {"expoClient": expo_config},
        }
    }
    print("publishing update group...")
    res = publish_update_group(update_info_group, "Movie Recommender v1 (SDK 57)")
    print("PUBLISH RESULT:", json.dumps(res, indent=2))
    groups = {r.get("group") for r in res if r.get("group")}
    if groups:
        gid = sorted(groups)[0]
        print("UPDATE PAGE: https://expo.dev/accounts/harpreetmailsexpo/projects/movie-app/updates/" + gid)


if __name__ == "__main__":
    main()
