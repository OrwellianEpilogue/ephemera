import json

def get_paths(data, current_path=""):
    paths = set()
    if isinstance(data, dict):
        for k, v in data.items():
            new_path = f"{current_path}.{k}" if current_path else k
            paths.add(new_path)
            paths.update(get_paths(v, new_path))
    return paths

with open('en/translation.json', 'r') as f1, open('fr/translation.json', 'r') as f2:
    en_keys = get_paths(json.load(f1))
    fr_keys = get_paths(json.load(f2))

missing_in_fr = sorted(list(en_keys - fr_keys))
extra_in_fr = sorted(list(fr_keys - en_keys))

print(f"--- CLÉS MANQUANTES EN FRANÇAIS ({len(missing_in_fr)}) ---")
for key in missing_in_fr:
    print(f"[-] {key}")

print(f"\n--- CLÉS EN TROP EN FRANÇAIS ({len(extra_in_fr)}) ---")
for key in extra_in_fr:
    print(f"[+] {key}")
