import re

with open(r'e:/CodeBuddy CN/resources/app/extensions/genie/out/webviews/index.a7a03a6ea674b267525c.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find the full deepseek config save function
for m in re.finditer('updateDeepSeekConfig|saveDeepSeek|deepseekConfig|onSave|handleSave', content):
    pos = m.start()
    start = max(0, pos-200)
    end = min(len(content), pos+400)
    print(f'=== {m.group()} at {pos} ===')
    snippet = content[start:end]
    clean = ''.join(c if c.isprintable() or c in '\n\r\t' else '.' for c in snippet)
    print(clean)
    print()

# Also look for the full UI around deepseek
for m in re.finditer('deepseek', content):
    pos = m.start()
    if 13108000 < pos < 13115000:
        start = max(0, pos-100)
        end = min(len(content), pos+300)
        print(f'=== deepseek UI at {pos} ===')
        snippet = content[start:end]
        clean = ''.join(c if c.isprintable() or c in '\n\r\t' else '.' for c in snippet)
        print(clean)
        print()
