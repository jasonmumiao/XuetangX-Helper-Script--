// ==UserScript==
// @name         学堂在线全能助手 - V3.7 (自动刷课优化)
// @namespace    http://tampermonkey.net/
// @version      3.7
// @description  [V3.7] 优化“自动刷课”功能，采用模拟点击方式，解决视频无法自动播放、调速及跳转的问题。支持后台2倍速静音播放、自动跳转下一单元。
// @author       Gemini AI Assistant (Based on V3.6)
// @match        https://*.xuetangx.com/*
// @require      https://cdn.bootcdn.net/ajax/libs/jquery/3.6.0/jquery.min.js
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // --- 可配置参数 ---
    const PRE_CLICK_DELAY_MS = 500;
    const POST_SUBMIT_DELAY_MS = 1500;
    const RETRY_POST_SUBMIT_DELAY_MS = 2500;
    const QUESTION_BANK_KEY = 'XUETANGX_QUESTION_BANK';

    // --- 全局变量 ---
    let isWorking = false; // 通用状态锁
    let videoAutoplayInterval = null; // 刷课定时器

    // --- 样式定义 ---
    GM_addStyle(`
        #control-panel { position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        .extractor-btn { background-color: #007bff; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; opacity: 0.9; transition: all 0.2s ease; width: 100%; text-align: center; }
        .extractor-btn:hover { opacity: 1; }
        #auto-video-btn { background-color: #5856D6; } /* 紫色：刷课 */
        #auto-extract-btn { background-color: #28a745; }
        #auto-answer-btn { background-color: #ff6347; }
        #answer-from-bank-btn { background-color: #17a2b8; }
        #return-first-btn { background-color: #6c757d; }
        #clear-bank-btn { background-color: #f0ad4e; }
        .extractor-btn:disabled { background-color: #ccc; cursor: not-allowed; }
        #result-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; justify-content: center; align-items: center; }
        #result-modal-content { background: white; padding: 25px; border-radius: 8px; width: 80%; max-width: 800px; height: 80%; display: flex; flex-direction: column; box-shadow: 0 5px 20px rgba(0,0,0,0.3); }
        #result-textarea { flex-grow: 1; width: 100%; margin-top: 15px; font-family: monospace; font-size: 13px; border: 1px solid #ccc; border-radius: 4px; padding: 10px; box-sizing: border-box; resize: none; }
        #modal-close-btn { position: absolute; top: 15px; right: 20px; font-size: 28px; font-weight: bold; color: #888; cursor: pointer; }
        #modal-close-btn:hover { color: #000; }
        .modal-btn { padding: 8px 15px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; background-color: #007bff; color: white; }
        #modal-copy-btn { background-color: #28a745; }
        #modal-export-btn { background-color: #17a2b8; }
    `);

    // --- 核心功能 1: 自动刷课 (V3.7 优化) ---
    /**
     * @description 通过模拟点击页面元素来控制视频播放、静音、倍速和跳转，以提高兼容性。
     */
    function checkVideoStateAndAct() {
        const video = $('video')[0]; // 使用jQuery查找video元素

        // 1. 如果页面上没有视频元素 (可能是作业、文档等)
        if (!video) {
            console.log("刷课: 当前非视频页, 5秒后尝试跳转...");
            setTimeout(() => {
                // 点击“下一单元”
                $('.next-btn a, .next, a:contains("下一单元")').first().click();
            }, 5000);
            return;
        }

        // 2. 如果页面上有视频，执行操作
        // 确保视频在播放状态 (通过点击按钮)
        const playBtn = $(".play-btn-tip");
        if (playBtn.length > 0 && playBtn.text() === "播放") {
            console.log("刷课: 视频已暂停, 尝试点击播放...");
            playBtn.click();
        }

        // 确保静音 (通过点击按钮)
        const mutedIcon = $(".xt_video_player_common_icon_muted");
        if (mutedIcon.length === 0) { // 如果没有静音图标，说明声音是开启的
            const soundIcon = $(".xt_video_player_common_icon");
            if (soundIcon.length > 0) {
                console.log("刷课: 视频未静音, 尝试点击静音...");
                soundIcon.click();
            }
        }

        // 确保2倍速 (通过点击按钮)
        const speedList = $(".xt_video_player_common_list");
        if (speedList.length > 0 && speedList.children().length > 0) {
            // 检查当前倍速是否已经是2.0x，避免不必要的重复点击
            const currentSpeedEl = speedList.parent().find('.xt_video_player_speed_show_box');
            if (currentSpeedEl.length === 0 || !currentSpeedEl.text().includes('2.0')) {
                console.log("刷课: 尝试设置2.0倍速...");
                $(speedList.children()[0]).click(); // 点击速度列表的第一个选项（通常是2.0X）
            }
        }

        // 3. 检查播放进度，如果快结束了就跳转
        const currentTime = video.currentTime;
        const duration = video.duration;

        // 增加 !isNaN(duration) 判断，防止视频刚加载时 duration 为 NaN
        if (duration > 0 && !isNaN(duration) && (currentTime / duration) > 0.96) {
            console.log(`刷课: 视频播放完成 (进度: ${ ((currentTime / duration) * 100).toFixed(2) }%), 跳转到下一单元...`);
            $('.next-btn a, .next, a:contains("下一单元")').first().click();
        }
    }

    function toggleVideoAutoplay() {
        const btn = $('#auto-video-btn');
        if (videoAutoplayInterval) {
            // --- 停止刷课 ---
            console.log("--- 停止自动刷课 ---");
            clearInterval(videoAutoplayInterval);
            videoAutoplayInterval = null;
            isWorking = false;
            btn.text('自动刷课').css('background-color', '#5856D6'); // 恢复原状
            // 尝试暂停视频
            const video = $('video')[0];
            if (video && !video.paused) {
                // 尝试通过点击按钮暂停
                const pauseBtn = $(".play-btn-tip");
                if (pauseBtn.length > 0 && pauseBtn.text() === "暂停") {
                    pauseBtn.click();
                }
            }
        } else if (!isWorking) {
            // --- 开始刷课 ---
            console.log("--- 开始自动刷课 ---");
            isWorking = true;
            checkVideoStateAndAct(); // 立即执行一次
            videoAutoplayInterval = setInterval(checkVideoStateAndAct, 3000); // 每3秒检查一次状态，提高响应速度
            btn.text('停止刷课').css('background-color', '#dc3545'); // 变为红色停止按钮
        } else {
            alert("另一项自动化任务正在运行，请等待其完成后再开始刷课。");
        }
    }

    // --- 核心功能 2: 题库管理 ---
    function getQuestionBank() {
        const bankJson = GM_getValue(QUESTION_BANK_KEY, '{}');
        return new Map(Object.entries(JSON.parse(bankJson)));
    }

    function updateQuestionBank(newData) {
        if (!newData || newData.length === 0) return;
        const bankMap = getQuestionBank();
        let addedCount = 0;
        newData.forEach(q => {
            if (q.stem && !bankMap.has(q.stem)) {
                bankMap.set(q.stem, q);
                addedCount++;
            }
        });
        if (addedCount > 0) {
            GM_setValue(QUESTION_BANK_KEY, JSON.stringify(Object.fromEntries(bankMap)));
            console.log(`题库已更新, 新增 ${addedCount} 题, 总数: ${bankMap.size}`);
        }
    }

    function clearQuestionBank() {
        const bankSize = getQuestionBank().size;
        if (bankSize === 0) {
            alert("本地题库已经是空的了。");
            return;
        }
        if (confirm(`确定要清空本地存储的 ${bankSize} 道题目吗？此操作不可恢复！`)) {
            GM_setValue(QUESTION_BANK_KEY, '{}');
            alert("本地题库已清空。");
        }
    }

    // --- 核心功能 3: 页面交互 (点击、状态检测) ---
    function performAdvancedClick(element) {
        console.log("执行高级点击模拟...", element);
        const eventInitParams = { bubbles: true, cancelable: true };
        try {
            element.dispatchEvent(new MouseEvent('mousedown', eventInitParams));
            element.dispatchEvent(new MouseEvent('mouseup', eventInitParams));
            element.dispatchEvent(new MouseEvent('click', eventInitParams));
        } catch (error) { console.error(`高级点击失败:`, error); }
    }

    function getPageNumbers() {
        const currentEl = document.querySelector('.tabbar .curent');
        const totalEl = document.querySelector('.tabbar .total');
        try {
            const current = parseInt(currentEl.innerText, 10);
            const totalText = totalEl.innerText.replace('/', '').trim();
            const total = parseInt(totalText, 10);
            return { current, total };
        } catch (e) { return { current: null, total: null }; }
    }

    async function waitForPageChange(oldPageNum, direction = 'forward') {
        const startTime = Date.now();
        const timeout = 10000;
        while (Date.now() - startTime < timeout) {
            const pageInfo = getPageNumbers();
            if (pageInfo.current) {
                if (direction === 'forward' && (pageInfo.current > oldPageNum || (oldPageNum === pageInfo.total && pageInfo.current === pageInfo.total))) {
                    console.log(`翻页成功: ${oldPageNum} -> ${pageInfo.current}`);
                    return true;
                }
                if (direction === 'backward' && pageInfo.current < oldPageNum) {
                    console.log(`返回成功: ${oldPageNum} -> ${pageInfo.current}`);
                    return true;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        console.warn("页面跳转检测超时。");
        return false;
    }

    // --- 核心功能 4: 提取页面数据 ---
    function scrapeCurrentPageData(skipDuplicateCheck = false) {
        const questionEl = document.querySelector('.leftQuestion');
        if (!questionEl) { return []; }
        let stemText = '';
        const stemElement = questionEl.querySelector('.fuwenben .custom_ueditor_cn_body');
        if (stemElement) stemText = stemElement.innerText.trim();
        else {
            const stemFallback = questionEl.querySelector('.fuwenben');
            if(stemFallback) stemText = stemFallback.innerText.trim();
        }
        if (!stemText) return [];

        let questionType = '未知题型';
        const questionContainer = questionEl.closest('.question');
        if (questionContainer) {
            const titleEl = questionContainer.querySelector('p.title');
            if (titleEl) {
                const titleText = titleEl.innerText;
                if (titleText.includes('单选')) questionType = '单选题';
                else if (titleText.includes('多选')) questionType = '多选题';
                else if (titleText.includes('判断')) questionType = '判断题';
            }
        }
        let sortKey = [999, 999];
        const match = stemText.match(/[（\(](\d+)-(\d+)[）\)]/);
        if (match) {
            sortKey = [parseInt(match[1], 10), parseInt(match[2], 10)];
        }
        let optionsList = [];
        const optionElements = questionEl.querySelectorAll('.leftradio');
        optionElements.forEach(optionEl => {
            const letterElement = optionEl.querySelector('.radio_xtb');
            const textElementContainer = optionEl.querySelector('.custom_ueditor_cn_body');
            if (letterElement && textElementContainer) {
                optionsList.push(`${letterElement.innerText.trim()}. ${textElementContainer.innerText.trim()}`);
            } else {
                optionsList.push(optionEl.innerText.trim().replace(/\s+/g, ' '));
            }
        });
        let correctAnswer = '';
        let correctAnswContainer = null;
        const answerTitleElements = document.querySelectorAll('p.myanswer');
        for (const titleElement of answerTitleElements) {
            if (titleElement.innerText.includes('正确答案')) {
                correctAnswContainer = titleElement.parentElement;
                break;
            }
        }
        if (correctAnswContainer) {
            const panduanElement = correctAnswContainer.querySelector('span.panduan');
            if (panduanElement) {
                correctAnswer = panduanElement.classList.contains('true') ? '正确' : '错误';
            } else {
                const choiceElements = correctAnswContainer.querySelectorAll('span.radio_xtb');
                const answerParts = [];
                choiceElements.forEach(el => {
                    const text = el.innerText.trim();
                    if (text) answerParts.push(text);
                });
                correctAnswer = answerParts.join(', ');
            }
        } else {
            correctAnswer = '未找到答案区域';
        }

        if (skipDuplicateCheck) {
            return [{ stem: stemText, options: optionsList, answer: correctAnswer, sortKey: sortKey, type: questionType }];
        }

        let processedQuestionStems = new Set();
        if (processedQuestionStems.has(stemText)) return [];
        processedQuestionStems.add(stemText);
        return [{ stem: stemText, options: optionsList, answer: correctAnswer, sortKey: sortKey, type: questionType }];
    }

    // --- 核心功能 5: 自动化流程控制 ---
    async function navigateToNextQuestion() {
        let nextPageElement = null;
        const nextButtonIcon = document.querySelector('.tabbar i.iconfont.right');
        if (nextButtonIcon && !nextButtonIcon.classList.contains('unselect')) {
            nextPageElement = nextButtonIcon;
        } else {
            const nextButtonTextXpath = "//button[contains(., '下一题')]";
            const nextButtonText = document.evaluate(nextButtonTextXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (nextButtonText && !nextButtonText.disabled) {
                nextPageElement = nextButtonText;
            }
        }
        if (nextPageElement) {
            const oldPageNum = getPageNumbers().current;
            if (PRE_CLICK_DELAY_MS > 0) await new Promise(resolve => setTimeout(resolve, PRE_CLICK_DELAY_MS));
            performAdvancedClick(nextPageElement);
            return await waitForPageChange(oldPageNum, 'forward');
        }
        return false;
    }

    // (A) 只提取 / (B) 暴力答题+提取
    async function runAutomation(mode = 'extract') {
        if (isWorking) return;
        isWorking = true;

        const triggerBtnId = mode === 'answer' ? 'auto-answer-btn' : 'auto-extract-btn';
        const triggerBtn = document.getElementById(triggerBtnId);
        const originalText = triggerBtn.innerText;
        triggerBtn.disabled = true;

        try {
            let allExtractedData = [];
            let processedQuestionStems = new Set();
            let pageInfo = getPageNumbers();
            if (pageInfo.current === null) {
                alert("错误：无法读取页码信息。");
                return;
            }
            while (true) {
                pageInfo = getPageNumbers();
                const btnTextPrefix = mode === 'answer' ? '答题中' : '提取中';
                triggerBtn.innerText = `${btnTextPrefix}... ${pageInfo.current}/${pageInfo.total}`;
                if (mode === 'answer') {
                    const submitButton = document.evaluate("//button[contains(., '提交')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if (submitButton) {
                        const firstOption = document.querySelector('.answerCon span.radio_xtb');
                        if (firstOption) {
                            performAdvancedClick(firstOption);
                            await new Promise(resolve => setTimeout(resolve, PRE_CLICK_DELAY_MS));
                        }
                        performAdvancedClick(submitButton);
                        await new Promise(resolve => setTimeout(resolve, POST_SUBMIT_DELAY_MS));
                    }
                }
                let currentPageItems = scrapeCurrentPageData(true);
                if (mode === 'answer' && pageInfo.current >= pageInfo.total && currentPageItems.length > 0 && currentPageItems[0].answer === '未找到答案区域') {
                    const retrySuccess = await retryLastQuestionSubmission();
                    if (retrySuccess) {
                        currentPageItems = scrapeCurrentPageData(true);
                    }
                }
                if (currentPageItems.length > 0) {
                    const questionData = currentPageItems[0];
                    if (questionData.stem && !processedQuestionStems.has(questionData.stem)) {
                        allExtractedData.push(questionData);
                        processedQuestionStems.add(questionData.stem);
                    }
                }
                if (pageInfo.current >= pageInfo.total) { console.log("已到末页。"); break; }
                const navigationSuccess = await navigateToNextQuestion();
                if (!navigationSuccess) { alert("翻页失败或超时。"); break; }
            }
            if (allExtractedData.length > 0) {
                updateQuestionBank(allExtractedData);
                const typePriority = { '单选题': 1, '多选题': 2, '判断题': 3, '未知题型': 99 };
                allExtractedData.sort((a, b) => {
                    const aP = typePriority[a.type] || 99;
                    const bP = typePriority[b.type] || 99;
                    if (aP !== bP) return aP - bP;
                    if (a.sortKey[0] !== b.sortKey[0]) return a.sortKey[0] - b.sortKey[0];
                    return a.sortKey[1] - b.sortKey[1];
                });
                showResultModal(allExtractedData);
            } else {
                alert("未提取到任何数据。");
            }
        } finally {
            isWorking = false;
            triggerBtn.disabled = false;
            triggerBtn.innerText = originalText;
        }
    }

    // (C) 按题库作答
    async function startAnswerFromBank() {
        if (isWorking) return;
        isWorking = true;

        const triggerBtn = document.getElementById('answer-from-bank-btn');
        const originalText = triggerBtn.innerText;
        triggerBtn.disabled = true;

        try {
            console.log("--- 任务开始: 按题库作答 ---");
            const questionBank = getQuestionBank();
            if (questionBank.size === 0) {
                alert("本地题库为空，无法执行此操作。请先使用“提取”或“自动答题”功能建立题库。");
                return;
            }
            console.log(`已加载 ${questionBank.size} 道题目的题库。`);

            let pageInfo = getPageNumbers();
            if (pageInfo.current === null) {
                alert("错误：无法读取页码信息。");
                return;
            }

            while (true) {
                pageInfo = getPageNumbers();
                triggerBtn.innerText = `智能答题... ${pageInfo.current}/${pageInfo.total}`;

                const currentQuestionData = scrapeCurrentPageData(true);

                if (currentQuestionData.length > 0 && currentQuestionData[0].stem) {
                    const currentStem = currentQuestionData[0].stem;
                    const storedQuestion = questionBank.get(currentStem);

                    if (storedQuestion && storedQuestion.answer && storedQuestion.answer !== '未找到答案区域') {
                        console.log(`在题库中找到题目: "${currentStem.substring(0,20)}..."，答案是: ${storedQuestion.answer}`);

                        const submitButton = document.evaluate("//button[contains(., '提交')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if(submitButton){
                            const clickSuccess = clickMatchingOptions(storedQuestion.answer);
                            if (clickSuccess) {
                                await new Promise(resolve => setTimeout(resolve, PRE_CLICK_DELAY_MS));
                                performAdvancedClick(submitButton);
                                await new Promise(resolve => setTimeout(resolve, POST_SUBMIT_DELAY_MS));
                            }
                        } else {
                            console.log("题目已作答，跳过提交。");
                        }
                    } else {
                        console.log(`题库中未找到题目: "${currentStem.substring(0,20)}..."，跳过。`);
                    }
                } else {
                    console.warn("当前页面未能提取到题干，跳过。");
                }

                if (pageInfo.current >= pageInfo.total) { console.log("已到末页。"); break; }

                const navigationSuccess = await navigateToNextQuestion();
                if (!navigationSuccess) { alert("翻页失败或超时。"); break; }
            }
            alert("按题库作答流程已完成！");
        } finally {
            isWorking = false;
            triggerBtn.disabled = false;
            triggerBtn.innerText = originalText;
        }
    }

    // 最后一题顽固重试
    async function retryLastQuestionSubmission() {
        let attempts = 5;
        while (attempts > 0) {
            console.log(`最后一题答案未找到，正在重试... 剩余尝试次数: ${attempts}`);
            const viewCardButton = document.evaluate("//button[contains(., '查看答题卡')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (viewCardButton) {
                return true;
            }
            const firstOption = document.querySelector('.answerCon span.radio_xtb');
            const submitButton = document.evaluate("//button[contains(., '提交')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (firstOption && submitButton) {
                performAdvancedClick(firstOption);
                await new Promise(resolve => setTimeout(resolve, PRE_CLICK_DELAY_MS));
                performAdvancedClick(submitButton);
                await new Promise(resolve => setTimeout(resolve, RETRY_POST_SUBMIT_DELAY_MS));
            } else {
                return false;
            }
            attempts--;
        }
        return false;
    }

    // 将答案映射到点击操作
    function clickMatchingOptions(storedAnswer) {
        const optionsOnPage = document.querySelectorAll('.leftQuestion .leftradio');
        const clickableSpans = document.querySelectorAll('.answerCon span.radio_xtb');
        if (clickableSpans.length === 0) return false;

        const isJudgment = clickableSpans[0].classList.contains('panduan');
        if (isJudgment) {
            const targetIndex = storedAnswer === '正确' ? 0 : 1;
            if (clickableSpans[targetIndex]) {
                performAdvancedClick(clickableSpans[targetIndex]);
                return true;
            }
        } else {
            const answersToClick = storedAnswer.split(',').map(s => s.trim());
            let clickedSomething = false;
            optionsOnPage.forEach((optionDiv, index) => {
                const labelSpan = optionDiv.querySelector('.radio_xtb');
                if (labelSpan && answersToClick.includes(labelSpan.innerText.trim())) {
                    if (clickableSpans[index]) {
                        performAdvancedClick(clickableSpans[index]);
                        clickedSomething = true;
                    }
                }
            });
            return clickedSomething;
        }
        return false;
    }

    // --- 结果格式化与显示 ---
    function formatResults(data) {
        let resultText = `共提取到 ${data.length} 道题目：\n\n`;
        let lastType = '';
        data.forEach((q) => {
            if (q.type !== lastType) {
                resultText += `--- ${q.type} ---\n\n`;
                lastType = q.type;
            }
            resultText += `${q.stem}\n\n`;
            q.options.forEach(opt => { resultText += `${opt}\n`; });
            resultText += `\n正确答案: ${q.answer}\n`;
            resultText += "\n" + "=".repeat(40) + "\n\n";
        });
        return resultText;
    }

    function getUsername() {
        try {
            const userElement = document.querySelector('div.sys-menu .user-name');
            if (userElement) {
                return userElement.innerText.replace(/Hi～\s*/, '').trim();
            }
            return 'unknown_user';
        } catch (e) {
            console.error("获取用户名时出错:", e);
            return 'error_user';
        }
    }

    function exportDataAsJSON(data) {
        const dataToExport = data.map(({ sortKey, ...rest }) => rest);
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        let chapterNum = '未知章节';
        if (data.length > 0 && data[0].sortKey && data[0].sortKey[0] !== 999) {
            chapterNum = data[0].sortKey[0];
        }
        const username = getUsername();
        const totalCount = data.length;
        a.download = `学堂在线题库_${chapterNum}_${username}_${totalCount}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    function showResultModal(data) {
        const resultText = formatResults(data);
        if (document.getElementById('result-modal-overlay')) document.getElementById('result-modal-overlay').remove();
        let overlay = document.createElement('div');
        overlay.id = 'result-modal-overlay';
        let modalContent = document.createElement('div');
        modalContent.id = 'result-modal-content';
        let closeBtn = document.createElement('span');
        closeBtn.id = 'modal-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = function() { overlay.remove(); };
        let title = document.createElement('h3');
        title.innerText = '题目提取结果汇总 (已排序)';
        title.style.margin = '0 0 15px 0';
        const buttonContainer = document.createElement('div');
        let copyBtn = document.createElement('button');
        copyBtn.id = 'modal-copy-btn';
        copyBtn.className = 'modal-btn';
        copyBtn.innerText = '复制到剪贴板';
        copyBtn.onclick = function() { GM_setClipboard(resultText); copyBtn.innerText = '已复制!'; setTimeout(() => { copyBtn.innerText = '复制到剪贴板'; }, 2000); };
        let exportBtn = document.createElement('button');
        exportBtn.id = 'modal-export-btn';
        exportBtn.className = 'modal-btn';
        exportBtn.innerText = '导出为JSON';
        exportBtn.onclick = function() { exportDataAsJSON(data); };
        buttonContainer.appendChild(copyBtn);
        buttonContainer.appendChild(exportBtn);
        let textArea = document.createElement('textarea');
        textArea.id = 'result-textarea';
        textArea.value = resultText;
        textArea.readOnly = true;
        modalContent.appendChild(closeBtn);
        modalContent.appendChild(title);
        modalContent.appendChild(buttonContainer);
        modalContent.appendChild(textArea);
        overlay.appendChild(modalContent);
        document.body.appendChild(overlay);
    }

    function runSinglePageExtract() {
        const data = scrapeCurrentPageData();
        if (data.length > 0) {
            updateQuestionBank(data);
            const typePriority = { '单选题': 1, '多选题': 2, '判断题': 3, '未知题型': 99 };
            data.sort((a, b) => {
                const aP = typePriority[a.type] || 99;
                const bP = typePriority[b.type] || 99;
                if (aP !== bP) return aP - bP;
                if (a.sortKey[0] !== b.sortKey[0]) return a.sortKey[0] - b.sortKey[0];
                return a.sortKey[1] - b.sortKey[1];
            });
            showResultModal(data);
        } else alert("在当前页面未找到符合条件的题目。");
    }

    async function returnToFirstQuestion() {
        if (isWorking) return;
        isWorking = true;
        const returnBtn = document.getElementById('return-first-btn');
        const originalText = returnBtn.innerText;
        returnBtn.disabled = true;
        try {
            while (true) {
                const pageInfo = getPageNumbers();
                if (!pageInfo.current || pageInfo.current === 1) {
                    break;
                }
                returnBtn.innerText = `正在返回... ${pageInfo.current}`;
                const prevIcon = document.querySelector('.tabbar i.iconfont:first-child');
                if (prevIcon && !prevIcon.classList.contains('unselect')) {
                    const oldPageNum = pageInfo.current;
                    performAdvancedClick(prevIcon);
                    const success = await waitForPageChange(oldPageNum, 'backward');
                    if (!success) {
                        alert("返回上一题失败或超时。");
                        break;
                    }
                } else {
                    break;
                }
            }
        } finally {
            isWorking = false;
            returnBtn.disabled = false;
            returnBtn.innerText = originalText;
        }
    }

    // --- UI 初始化 ---
    function initializeControls() {
        if (document.getElementById('control-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'control-panel';

        const autoVideoBtn = document.createElement('button');
        autoVideoBtn.id = 'auto-video-btn';
        autoVideoBtn.className = 'extractor-btn';
        autoVideoBtn.innerHTML = '自动刷课';
        autoVideoBtn.addEventListener('click', toggleVideoAutoplay);

        const singleExtractBtn = document.createElement('button');
        singleExtractBtn.className = 'extractor-btn';
        singleExtractBtn.innerHTML = '提取当前页';
        singleExtractBtn.addEventListener('click', runSinglePageExtract);

        const autoExtractBtn = document.createElement('button');
        autoExtractBtn.id = 'auto-extract-btn';
        autoExtractBtn.className = 'extractor-btn';
        autoExtractBtn.innerHTML = '自动翻页提取';
        autoExtractBtn.addEventListener('click', () => runAutomation('extract'));

        const autoAnswerBtn = document.createElement('button');
        autoAnswerBtn.id = 'auto-answer-btn';
        autoAnswerBtn.className = 'extractor-btn';
        autoAnswerBtn.innerHTML = '自动答题并提取';
        autoAnswerBtn.addEventListener('click', () => runAutomation('answer'));

        const answerFromBankBtn = document.createElement('button');
        answerFromBankBtn.id = 'answer-from-bank-btn';
        answerFromBankBtn.className = 'extractor-btn';
        answerFromBankBtn.innerHTML = '按题库作答';
        answerFromBankBtn.addEventListener('click', startAnswerFromBank);

        const returnFirstBtn = document.createElement('button');
        returnFirstBtn.id = 'return-first-btn';
        returnFirstBtn.className = 'extractor-btn';
        returnFirstBtn.innerHTML = '返回第一题';
        returnFirstBtn.addEventListener('click', returnToFirstQuestion);

        const clearBankBtn = document.createElement('button');
        clearBankBtn.id = 'clear-bank-btn';
        clearBankBtn.className = 'extractor-btn';
        clearBankBtn.innerHTML = '清空本地题库';
        clearBankBtn.addEventListener('click', clearQuestionBank);

        panel.appendChild(autoVideoBtn);
        panel.appendChild(singleExtractBtn);
        panel.appendChild(autoExtractBtn);
        panel.appendChild(autoAnswerBtn);
        panel.appendChild(answerFromBankBtn);
        panel.appendChild(returnFirstBtn);
        panel.appendChild(clearBankBtn);
        document.body.appendChild(panel);
    }

    // --- 脚本启动入口 ---
    $(document).ready(function() {
        // 使用更通用的选择器，确保在课程视频页和题目页都能加载
        // 延迟加载以确保页面元素完全渲染
        setTimeout(() => {
            if (document.querySelector('.xt_video_player') || document.querySelector('.content--xt')) {
                initializeControls();
            }
        }, 2000);
    });

})();