const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
const content = fs.readFileSync(indexPath, 'utf8');

// initialize 함수 찾기 (5104 ~ 5498 라인)
const lines = content.split('\n');

// 새로운 initialize 함수
const newInitFunction = `    async function initialize() {
      console.log("⏱️ 데이터 초기화 시작...");
      const startTime = performance.now();

      // 🚩 [최적화] 단계별 로딩: 1) 초기 화면 필수 데이터 → 2) 나머지 백그라운드
      console.time("📡 필수 데이터 로드");
      
      // 📊 진행률 추적 객체
      const loadingProgress = {
          total: 5, // 1단계: countries, castles(전체), territories, timeline 생성, 초기 렌더
          loaded: 0,
          updateProgress: function(label) {
              this.loaded++;
              const percent = Math.round((this.loaded / this.total) * 100);
              console.log(\`📊 필수 로딩: \${percent}% (\${this.loaded}/\${this.total}) - \${label}\`);
          }
      };

      // 빈 배열로 초기화
      territories = [];
      events = [];
      drawings = [];
      history = [];
      naturalFeatures = [];

      // ===== 1단계: 초기 화면 표시에 필요한 데이터만 우선 로드 =====
      
      // 🏁 [우선순위 1] 국가 데이터 로드
      console.log('🌍 국가 데이터 로딩...');
      countries = await fetchData('countries');
      loadingProgress.updateProgress('국가 데이터');
      
      // 🏁 [우선순위 2] 성/도시 전체 데이터 로드 (국가명 라벨 포함)
      console.log('🏰 성/도시 데이터 로딩...');
      console.time("🏰 Castle 데이터 로드");
      const allCastlesData = await fetchData('castle');
      
      // castles 처리 (history 필드 보강)
      castles = allCastlesData.map(castle => {
          let processedHistory;
          const hasHistory = castle.history && Array.isArray(castle.history) && castle.history.length > 0;

          if (hasHistory) {
              processedHistory = castle.history.map(h => {
                  const parsedStartYear = (h.start_year !== undefined && h.start_year !== null && h.start_year !== '') ? parseInt(h.start_year) : (castle.built_year !== undefined && castle.built_year !== null ? parseInt(castle.built_year) : -5000);
                  const parsedStartMonth = (h.start_month !== undefined && h.start_month !== null && h.start_month !== '') ? parseInt(h.start_month) : (castle.built_month !== undefined && castle.built_month !== null ? parseInt(castle.built_month) : 1);
                  const parsedEndYear = (h.end_year !== undefined && h.end_year !== null && h.end_year !== '') ? parseInt(h.end_year) : null;
                  const parsedEndMonth = (h.end_month !== undefined && h.end_month !== null && h.end_month !== '') ? parseInt(h.end_month) : (castle.destroyed_month !== undefined && castle.destroyed_month !== null ? parseInt(castle.destroyed_month) : 12);

                  let resolvedCountryId = h.country_id || castle.country_id || '';
                  if (resolvedCountryId && typeof resolvedCountryId !== 'string') resolvedCountryId = resolvedCountryId.toString();
                  if (!resolvedCountryId && h.country) {
                      const match = countries.find(c => c.name === h.country);
                      if (match) resolvedCountryId = match._id;
                  }

                  return {
                      name: h.name ?? castle.name ?? '',
                      country_id: resolvedCountryId || '',
                      start_year: parsedStartYear,
                      start_month: parsedStartMonth,
                      end_year: parsedEndYear,
                      end_month: parsedEndMonth,
                      is_capital: h.is_capital !== undefined ? !!h.is_capital : !!castle.is_capital,
                      is_battle: h.is_battle !== undefined ? !!h.is_battle : false
                  };
              });
          } else {
              processedHistory = [{
                  name: castle.name || '',
                  country_id: castle.country_id || '',
                  start_year: castle.built_year || -5000,
                  start_month: castle.built_month || 1,
                  end_year: castle.destroyed_year,
                  end_month: castle.destroyed_month || 12,
                  is_capital: castle.is_capital || false,
                  is_battle: castle.is_battle || false
              }];
          }

          if (castle.is_capital && !processedHistory.some(h => h.is_capital)) {
              if (processedHistory.length > 0) {
                  processedHistory[0].is_capital = true;
              }
          }

          return { ...castle, history: processedHistory };
      });
      
      console.timeEnd("🏰 Castle 데이터 로드");
      console.log(\`✅ 성/도시 데이터: \${castles.length}개\`);
      loadingProgress.updateProgress('성/도시');
      populateCitySelectForEdit();
      
      // 🏁 [우선순위 3] 영토 데이터 로드
      console.log('🗺️ 영토 데이터 로딩...');
      try {
          await window.loadTerritoryTiles();
          console.log(\`✅ 영토 데이터: \${territories.length}개\`);
          loadingProgress.updateProgress('영토');
      } catch (error) {
          console.error('❌ 영토 데이터 로드 실패:', error);
          territories = [];
          loadingProgress.updateProgress('영토 (실패)');
      }
      
      // 🏁 [우선순위 4] 연대표 데이터 로드 (events + history)
      console.log('📅 연대표 데이터 로딩...');
      try {
          const [eventsData, historyData] = await Promise.all([
              fetchData('events'),
              fetchData('history')
          ]);
          
          events = eventsData || [];
          history = historyData || [];
          
          // 시간 목록 생성 (연대표용)
          console.time("⏰ 시간 목록 생성");
          const historyTimes = history.map(h => yearMonthToTotalMonths(h.year, h.month || 1));
          const eventTimes = events.map(e => yearMonthToTotalMonths(e.year, e.month || 1));
          historyEventTimes = [...new Set([...historyTimes, ...eventTimes])].sort((a, b) => a - b);
          console.timeEnd("⏰ 시간 목록 생성");
          
          console.log(\`✅ 연대표 데이터: 이벤트 \${events.length}개, 역사 \${history.length}개\`);
          loadingProgress.updateProgress('연대표');
      } catch (error) {
          console.error('❌ 연대표 데이터 로드 실패:', error);
          events = [];
          history = [];
          historyEventTimes = [];
          loadingProgress.updateProgress('연대표 (실패)');
      }
      
      // 🏁 [우선순위 5] 초기 지도 렌더링
      console.log("🖼️ 초기 지도 렌더링...");
      updateMap(parseInt(yearInput.value), parseInt(monthInput.value));
      loadingProgress.updateProgress('초기 렌더링');
      
      console.timeEnd("📡 필수 데이터 로드");
      const initialLoadTime = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(\`✅ 초기 화면 로드 완료! (\${initialLoadTime}초)\`);

      // ===== 2단계: 백그라운드에서 나머지 데이터 로드 =====
      (async () => {
          console.log('🔄 백그라운드 로딩 시작...');
          const backgroundStartTime = performance.now();
          
          try {
              // 왕 데이터 로드
              console.log('👑 왕 데이터 로딩...');
              const kingsDataResult = await fetchData('kings');
              kings = {};
              if (Array.isArray(kingsDataResult)) {
                  kingsDataResult.forEach(item => {
                      if (item.country_id && Array.isArray(item.kings)) {
                          kings[item.country_id] = item.kings;
                      }
                  });
              }
              console.log(\`✅ 왕 데이터 로드 완료\`);
          } catch (error) {
              console.error('❌ 왕 데이터 로드 실패:', error);
              kings = {};
          }

          try {
              // drawings 로드
              console.log('🎨 그리기 데이터 로딩...');
              const drawingsData = await fetchData('drawings');
              drawings = drawingsData || [];
              console.log(\`✅ 그리기 데이터: \${drawings.length}개\`);
          } catch (error) {
              console.error('❌ 그리기 데이터 로드 실패:', error);
              drawings = [];
          }

          try {
              // 자연 지형지물 로드
              console.log('🌊 자연 지형지물 로딩...');
              const featuresData = await fetchData('natural-features');
              naturalFeatures = featuresData || [];
              console.log(\`✅ 자연 지형지물: \${naturalFeatures.length}개\`);
              
              // 강 레이어가 켜져 있으면 자동으로 렌더링
              if (layerVisibility.rivers) {
                  const { year, month } = getCurrentYearMonth();
                  updateMap(year, month);
              }
          } catch (error) {
              console.error('❌ 자연 지형지물 로드 실패:', error);
              naturalFeatures = [];
          }

          const backgroundLoadTime = ((performance.now() - backgroundStartTime) / 1000).toFixed(2);
          console.log(\`✅ 백그라운드 로딩 완료! (\${backgroundLoadTime}초)\`);
          
          const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
          console.log(\`🎉 전체 데이터 로드 완료! (총 \${totalTime}초)\`);
      })();
    }`;

// 5104 ~ 5498 라인을 새 함수로 교체
const before = lines.slice(0, 5103).join('\n');
const after = lines.slice(5498).join('\n');
const newContent = before + '\n' + newInitFunction + '\n' + after;

// 파일 저장
fs.writeFileSync(indexPath, newContent, 'utf8');

console.log('✅ initialize 함수 교체 완료!');
console.log(`   이전: ${5498 - 5104 + 1} 라인`);
console.log(`   이후: ${newInitFunction.split('\n').length} 라인`);
