import json
import urllib.request
import urllib.error
import subprocess
import hashlib
import time

API_URL = "http://127.0.0.1:4000"

def run_psql(query):
    cmd = ["docker", "compose", "exec", "-T", "postgres", "psql", "-U", "traceiq", "-d", "traceiq", "-t", "-A", "-c", query]
    res = subprocess.run(cmd, cwd="/opt/traceiq", capture_output=True, text=True, check=True)
    return res.stdout.strip()

def http_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body

def http_post(url, data, headers=None):
    hdrs = {'Content-Type': 'application/json'}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=hdrs, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body

def main():
    print("=== TRACEIQ PRODUCTION SMOKE TEST START ===")
    
    # 1. Health check
    code, body = http_get(f"{API_URL}/health")
    print(f"[1] API Health check: {code} -> status={body.get('status')}")
    assert code == 200, "Health check failed"

    # 2. Security isolation test: Write keys blocked on dashboard routes
    code, _ = http_get(f"{API_URL}/v1/dashboard/users/search?q=test", headers={"x-traceiq-write-key": "trc_live_invalid"})
    print(f"[2] Security test: Write-key blocked on GET /v1/dashboard/users/search -> HTTP {code} (Expected 401)")
    assert code == 401, f"Security test failed, expected 401 got {code}"

    code, _ = http_post(f"{API_URL}/v1/dashboard/users/resolve", {"distinctIds": ["123"]}, headers={"x-traceiq-write-key": "trc_live_invalid"})
    print(f"[3] Security test: Write-key blocked on POST /v1/dashboard/users/resolve -> HTTP {code} (Expected 401)")
    assert code == 401, f"Security test failed, expected 401 got {code}"

    # 3. Find target project containing user Emmanuel & member user ID
    target_row = run_psql("""
        SELECT u.project_id || '|' || om.user_id
        FROM users u
        JOIN projects p ON p.id = u.project_id
        JOIN organization_members om ON om.organization_id = p.organization_id
        WHERE u.external_id ILIKE '%emmanuel%' OR u.traits::text ILIKE '%emmanuel%'
        LIMIT 1;
    """)
    if not target_row:
        target_row = run_psql("""
            SELECT u.project_id || '|' || om.user_id
            FROM users u
            JOIN projects p ON p.id = u.project_id
            JOIN organization_members om ON om.organization_id = p.organization_id
            GROUP BY u.project_id, om.user_id
            ORDER BY count(u.id) DESC
            LIMIT 1;
        """)
    project_id, org_user_id = target_row.split('|')
    print(f"[4] Selected test project_id: {project_id}")

    # 4. Create temporary test write key
    test_key_id = f"pwk_smoke_{int(time.time())}"
    raw_write_key = f"trc_live_smoke_{hashlib.md5(str(time.time()).encode()).hexdigest()}"
    key_hash = hashlib.sha256(raw_write_key.encode()).hexdigest()
    key_prefix = raw_write_key[:12]
    run_psql(f"INSERT INTO project_write_keys (id, project_id, key_prefix, key_hash, name, created_at) VALUES ('{test_key_id}', '{project_id}', '{key_prefix}', '{key_hash}', 'Smoke Test Key', now());")

    # 5. Create temporary PAT for dashboard authentication with required scopes
    raw_pat = "tiq_pat_test_" + hashlib.md5(str(time.time()).encode()).hexdigest()
    token_hash = hashlib.sha256(raw_pat.encode()).hexdigest()
    pat_prefix = raw_pat[:12]
    
    pat_id = f"pat_smoke_{int(time.time())}"
    scopes_sql = "ARRAY['users:read', 'flags:read', 'flags:write', 'projects:read']::text[]"
    run_psql(f"INSERT INTO personal_access_tokens (id, user_id, name, token_prefix, token_hash, scopes, created_at, last_used_at) VALUES ('{pat_id}', '{org_user_id}', 'Smoke Test Token', '{pat_prefix}', '{token_hash}', {scopes_sql}, now(), now());")
    
    dash_headers = {"Authorization": f"Bearer {raw_pat}"}
    
    try:
        # 6. Test GET /v1/dashboard/users/search (Search "Emmanuel")
        code, search_res = http_get(f"{API_URL}/v1/dashboard/users/search?projectId={project_id}&q=Emmanuel", headers=dash_headers)
        persons = search_res.get('persons', [])
        print(f"[5] GET /v1/dashboard/users/search (q=Emmanuel): HTTP {code}, results count: {len(persons)}")
        assert code == 200, f"Search failed: {search_res}"
        assert len(persons) > 0, "Expected at least 1 match for Emmanuel in test project"
        
        target_person = persons[0]
        canonical_distinct_id = target_person.get('distinctId')
        display_name = target_person.get('displayName')
        masked_email = target_person.get('emailMasked')
        traits_preview = target_person.get('traitsPreview', {})
        print(f"    Target user resolved: displayName={display_name}, distinctId={canonical_distinct_id}, emailMasked={masked_email}, traitsPreview keys={list(traits_preview.keys())}")
        assert canonical_distinct_id, "Target person must have a canonical distinctId"

        # Test keyset / cursor pagination without search term
        code, recent_res = http_get(f"{API_URL}/v1/dashboard/users/search?projectId={project_id}&limit=5", headers=dash_headers)
        recent_persons = recent_res.get('persons', [])
        print(f"[6] GET /v1/dashboard/users/search (keyset pagination, limit 5): HTTP {code}, count: {len(recent_persons)}, hasMore: {recent_res.get('hasMore')}, nextCursor: {bool(recent_res.get('nextCursor'))}")
        assert code == 200, f"Keyset search failed: {recent_res}"

        # 7. Test POST /v1/dashboard/users/resolve
        code, resolve_res = http_post(f"{API_URL}/v1/dashboard/users/resolve?projectId={project_id}", {"distinctIds": [canonical_distinct_id]}, headers=dash_headers)
        resolved_persons = resolve_res.get('persons', [])
        print(f"[7] POST /v1/dashboard/users/resolve: HTTP {code}, resolved count: {len(resolved_persons)}")
        assert code in (200, 201), f"Resolve failed: {resolve_res}"
        assert len(resolved_persons) == 1, "Expected 1 resolved user"
        assert resolved_persons[0].get('distinctId') == canonical_distinct_id, "Resolved distinctId mismatch"

        # 8. Test Public Feature Flag evaluation endpoint
        eval_payload = {
            "projectId": project_id,
            "writeKey": raw_write_key,
            "distinctId": canonical_distinct_id,
            "environment": "production"
        }
        code, flag_eval_res = http_post(f"{API_URL}/v1/flags/evaluate", eval_payload, headers={"x-traceiq-write-key": raw_write_key})
        print(f"[8] POST /v1/flags/evaluate (public): HTTP {code}, evaluated flags count: {len(flag_eval_res.get('flags', {}))}")
        assert code in (200, 201), f"Flags evaluate failed: {flag_eval_res}"

        # 9. Test Feature Flag Specific User Override Smoke Test
        test_flag_key = f"smoke-test-flag-{int(time.time())}"
        test_flag_id = f"flag_smoke_{int(time.time())}"
        
        # Insert test flag with enabled=true, rollout_percentage=0, override={target_user: true}
        run_psql(f"""
            INSERT INTO feature_flags (
                id, project_id, key, name, description, flag_type, enabled,
                rollout_percentage, targeting_groups, overrides,
                revision, created_at, updated_at
            ) VALUES (
                '{test_flag_id}', '{project_id}', '{test_flag_key}', 'Smoke Test Flag', 'Temp flag for smoke test',
                'boolean', true,
                0,
                '[]',
                '{{"{canonical_distinct_id}": true}}',
                1, now(), now()
            );
        """)
        
        # Evaluation for overridden user must be True (rollout 0%)
        code, eval_override_on = http_post(
            f"{API_URL}/v1/flags/evaluate",
            {"projectId": project_id, "writeKey": raw_write_key, "distinctId": canonical_distinct_id, "environment": "production"},
            headers={"x-traceiq-write-key": raw_write_key}
        )
        flag_val_on = eval_override_on.get('flags', {}).get(test_flag_key)
        print(f"[9] Feature Flag Override ON test (rollout 0%, user override ON): enabled={flag_val_on} (Expected: True)")
        assert flag_val_on is True, f"Expected flag to be True via override, got {flag_val_on}"

        # Evaluation for other user must be False (rollout 0%)
        code, eval_unoverridden = http_post(
            f"{API_URL}/v1/flags/evaluate",
            {"projectId": project_id, "writeKey": raw_write_key, "distinctId": "unrelated_user_9999", "environment": "production"},
            headers={"x-traceiq-write-key": raw_write_key}
        )
        flag_val_off = eval_unoverridden.get('flags', {}).get(test_flag_key)
        print(f"[10] Feature Flag Default test (rollout 0%, standard user): enabled={flag_val_off} (Expected: False)")
        assert flag_val_off is False, f"Expected flag to be False, got {flag_val_off}"

        # Excluded user override test (rollout=100%, override={target_user: false})
        run_psql(f"""
            UPDATE feature_flags
            SET rollout_percentage = 100,
                overrides = '{{"{canonical_distinct_id}": false}}'
            WHERE id = '{test_flag_id}';
        """)
        code, eval_override_off = http_post(
            f"{API_URL}/v1/flags/evaluate",
            {"projectId": project_id, "writeKey": raw_write_key, "distinctId": canonical_distinct_id, "environment": "production"},
            headers={"x-traceiq-write-key": raw_write_key}
        )
        flag_val_excluded = eval_override_off.get('flags', {}).get(test_flag_key)
        print(f"[11] Feature Flag Override EXCLUDED test (rollout 100%, user override OFF): enabled={flag_val_excluded} (Expected: False)")
        assert flag_val_excluded is False, f"Expected flag to be False via exclude override, got {flag_val_excluded}"

        # Clean up test flag
        run_psql(f"DELETE FROM feature_flags WHERE id = '{test_flag_id}';")
        print("[12] Cleaned up temporary test flag.")

    finally:
        # Always clean up PAT and write key
        run_psql(f"DELETE FROM personal_access_tokens WHERE id = '{pat_id}';")
        run_psql(f"DELETE FROM project_write_keys WHERE id = '{test_key_id}';")
        print("[13] Cleaned up temporary PAT and write key.")

    print("=== ALL PRODUCTION SMOKE TESTS PASSED SUCCESSFULLY ===")

if __name__ == '__main__':
    main()
