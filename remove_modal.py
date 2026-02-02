#!/usr/bin/env python3
with open('index.html', 'r') as f:
    lines = f.readlines()

# 삭제할 라인 범위 찾기
start_line = -1
end_line = -1

for i, line in enumerate(lines):
    if '<!-- 🚩 [추가] 웰컴 팝업 모달 -->' in line:
        start_line = i
    if start_line != -1 and '<!-- 🚩 [추가] 사관 모집 팝업 모달 -->' in line:
        end_line = i
        break

print(f'Start line: {start_line}')
print(f'End line: {end_line}')

if start_line != -1 and end_line != -1:
    # start_line부터 end_line 직전까지 삭제
    new_lines = lines[:start_line] + lines[end_line:]
    
    with open('index.html', 'w') as f:
        f.writelines(new_lines)
    
    print(f'Deleted {end_line - start_line} lines')
    print('Ranking modal HTML removed successfully')
else:
    print('Markers not found')
