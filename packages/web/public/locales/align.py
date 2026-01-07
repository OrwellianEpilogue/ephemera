import json

def align_json(template, target):
    if isinstance(template, dict) and isinstance(target, dict):
        new_obj = {}
        for key in template.keys():
            if key in target:
                new_obj[key] = align_json(template[key], target[key])
        for key in target.keys():
            if key not in new_obj:
                new_obj[key] = target[key]
        return new_obj
    return target

with open('en/translation.json', 'r', encoding='utf-8') as f1, \
        open('fr/translation.json', 'r', encoding='utf-8') as f2:
    data1 = json.load(f1)
    data2 = json.load(f2)

aligned_data = align_json(data1, data2)

with open('fr_aligned.json', 'w', encoding='utf-8') as f_out:
    # Utilisation de indent=2 pour correspondre à ton original
    json.dump(aligned_data, f_out, indent=2, ensure_ascii=False)
