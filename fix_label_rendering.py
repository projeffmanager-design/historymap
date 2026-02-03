#!/usr/bin/env python3
"""
지명/민족 라벨 즉시 렌더링 수정 스크립트
- 문제: layerVisibility.countryLabel만 체크해서 place/ethnic 라벨이 안 뜸
- 해결: renderImmediateCountryLabels() 함수 호출로 변경 (모든 라벨 처리)
"""

def fix_label_rendering():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 🎯 [핵심] 6914-6960라인의 옛날 코드를 찾아서 새 코드로 교체
    old_block_start = '// 🏷️ [초고속 라벨] 국가 라벨을 0.5초에 즉시 표시 (영토보다 먼저!)'
    old_block_end = "console.log('✅ [0.5초] 국가 라벨 즉시 렌더링 완료!');"
    
    # old_block_start부터 old_block_end까지 찾기
    start_idx = content.find(old_block_start)
    if start_idx == -1:
        print(f"❌ 시작 마커를 찾을 수 없습니다: {old_block_start[:50]}...")
        return False
    
    end_idx = content.find(old_block_end, start_idx)
    if end_idx == -1:
        print(f"❌ 종료 마커를 찾을 수 없습니다: {old_block_end}")
        return False
    
    # old_block_end 라인 전체 포함
    end_idx = content.find('\n', end_idx) + 1
    
    # 새 코드 작성
    new_block = '''// 🏷️ [초고속 라벨] 모든 라벨(국가+지명+민족)을 0.5초에 즉시 표시!
              // 라벨 레이어 중 하나라도 켜져 있으면 renderImmediateCountryLabels 호출
              if ((layerVisibility.countryLabel || layerVisibility.placeLabel || layerVisibility.ethnicLabel) 
                  && castles.length > 0) {
                  console.log('🚩 [초고속 라벨] 전체 라벨 즉시 렌더링 시작 (국가+지명+민족)');
                  console.log(`🏷️ [라벨 레이어] country: ${layerVisibility.countryLabel}, place: ${layerVisibility.placeLabel}, ethnic: ${layerVisibility.ethnicLabel}`);
                  
                  const { year, month } = getCurrentYearMonth();
                  
                  // 🎯 renderImmediateCountryLabels 함수 호출 (모든 라벨 처리)
                  renderImmediateCountryLabels(year, month);
                  
                  console.log('✅ [초고속 라벨] 전체 라벨(국가+지명+민족) 즉시 렌더링 완료!');
              }
'''
    
    # 교체
    new_content = content[:start_idx] + new_block + content[end_idx:]
    
    # 저장
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"✅ 수정 완료!")
    print(f"   - 제거된 코드: {end_idx - start_idx}자")
    print(f"   - 새 코드: {len(new_block)}자")
    print(f"   - 차이: {len(new_block) - (end_idx - start_idx):+d}자")
    return True

if __name__ == '__main__':
    success = fix_label_rendering()
    exit(0 if success else 1)
