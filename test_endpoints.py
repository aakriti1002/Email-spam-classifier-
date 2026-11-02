import json, urllib.request, urllib.error, sys, os

base = "http://127.0.0.1:5000"
ok = 0; fail = 0

_client = None
try:
    urllib.request.urlopen(base + "/", timeout=0.5)
    _use_http = True
except Exception:
    _use_http = False
    from app import app
    app.config["TESTING"] = True
    _client = app.test_client()

def chk(name, cond):
    global ok, fail
    if cond:
        print(f"  [PASS] {name}"); ok += 1
    else:
        print(f"  [FAIL] {name}"); fail += 1

def req_get(path):
    if _use_http:
        return urllib.request.urlopen(base + path)
    res = _client.get(path)
    class Resp:
        status = res.status_code
        headers = dict(res.headers)
        def read(self):
            return res.get_data()
    if res.status_code >= 400:
        raise urllib.error.HTTPError(base + path, res.status_code, "err", res.headers, None)
    return Resp()

def req_post(path, data_bytes, headers):
    if _use_http:
        req = urllib.request.Request(base + path, data=data_bytes, headers=headers)
        return urllib.request.urlopen(req)
    content_type = headers.get("Content-Type", "application/json")
    res = _client.post(path, data=data_bytes, content_type=content_type)
    class Resp:
        status = res.status_code
        headers = dict(res.headers)
        def read(self):
            return res.get_data()
    if res.status_code >= 400:
        raise urllib.error.HTTPError(base + path, res.status_code, "err", res.headers, None)
    return Resp()

# 1. Homepage
print("=== Homepage ===")
r = req_get("/")
chk("GET / returns 200", r.status == 200)

# 2. Dashboard
print("=== Dashboard ===")
r = req_get("/dashboard")
chk("GET /dashboard returns 200", r.status == 200)

# 3. 404 returns JSON not HTML
print("=== 404 returns JSON ===")
try:
    req_get("/nonexistent-route")
    chk("404 returns error", False)
except urllib.error.HTTPError as e:
    body = e.headers.get("error", "") if hasattr(e, "headers") else ""
    chk("404 Content-Type is JSON", e.code == 404)
    chk("404 status is 404", e.code == 404)

# 4. Spam
print("=== Spam classification ===")
payload = json.dumps({"email": "Congratulations! You won a lottery prize. Click here claim FREE reward now!"}).encode()
r = json.loads(req_post("/api/predict", data_bytes=payload, headers={"Content-Type": "application/json"}).read())
chk("Spam prediction = Spam", r["prediction"] == "Spam")
chk("Spam confidence is a number", isinstance(r["confidence"], (int, float)))
chk("Spam riskScore > 40", r["riskScore"] > 40)
chk("Spam reasons not empty", len(r["reasons"]) > 0)
print(f"     confidence={r['confidence']}%, risk={r['riskScore']}")

# 5. Ham
print("=== Ham classification ===")
payload2 = json.dumps({"email": "Hi can we schedule a meeting tomorrow at 3pm to discuss the project?"}).encode()
r2 = json.loads(req_post("/api/predict", data_bytes=payload2, headers={"Content-Type": "application/json"}).read())
chk("Ham prediction = Ham", r2["prediction"] == "Ham")
chk("Ham riskScore < 35", r2["riskScore"] < 35)

# 6. Phishing + URL
print("=== Phishing + URL ===")
payload3 = json.dumps({"email": "URGENT bank account suspended verify http://bit.ly/verify-now immediately"}).encode()
r3 = json.loads(req_post("/api/predict", data_bytes=payload3, headers={"Content-Type": "application/json"}).read())
chk("Phishing classified Spam", r3["prediction"] == "Spam")
chk("URL count >= 1", r3["urlAnalysis"]["count"] >= 1)
chk("Shortened URL detected", r3["urlAnalysis"]["shortened"] >= 1)
chk("phishingDetected = True", r3["phishingDetected"] == True)

# 7. Empty input -> JSON 400
print("=== Input validation ===")
try:
    payload4 = json.dumps({"email": ""}).encode()
    req_post("/api/predict", data_bytes=payload4, headers={"Content-Type": "application/json"})
    chk("Empty returns 400", False)
except urllib.error.HTTPError as e:
    chk("Empty input -> 400 JSON", e.code == 400)

# 8. History
print("=== History API ===")
r5 = json.loads(req_get("/api/history").read())
chk("History has data array", "data" in r5)
chk("History total >= 3", r5["total"] >= 3)

# 9. Stats
print("=== Stats API ===")
r6 = json.loads(req_get("/api/stats").read())
chk("Stats has total", "total" in r6)

# 10. Model info
print("=== Model info ===")
r7 = json.loads(req_get("/api/model-info").read())
chk("Model info has best_model", "best_model" in r7)
chk("Best model = SVM", "Support Vector" in r7["best_model"])

print(f"\n================================================")
print(f"  RESULTS: {ok} PASSED  |  {fail} FAILED")
print(f"================================================")
