document.addEventListener('DOMContentLoaded', function() {
    // --- Firebase & Telegram Setup ---
    const firebaseConfig = {
        apiKey: "AIzaSyDW4TSXHbpP92hyeLvuBdSdVu56xKayTd8",
        authDomain: "test-dc90d.firebaseapp.com",
        databaseURL: "https://test-dc90d-default-rtdb.firebaseio.com",
        projectId: "test-dc90d",
        storageBucket: "test-dc90d.appspot.com",
        messagingSenderId: "804710782593",
        appId: "1:804710782593:web:48921608aad6d348afdf80",
        measurementId: "G-29YGNDZ2J4"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const tg = window.Telegram.WebApp;

    // --- Constants & Global Variables ---
    const BOT_USERNAME = "Bkash_earn_free_TkBot";
    const MINIMUM_WITHDRAW_AMOUNT = 10;
    let appConfig = { dailyReward: 1 };
    let spinConfig = { dailyLimit: 5, rewardAmount: 1 };
    let quizConfig = { dailyLimit: 5, reward: 2, clickTarget: 5 };
    let currentUser, userRef, userData = {};
    let isSpinning = false;
    let currentRotation = 0;
    let quizQuestions = [];
    let currentQuizIndex = 0;
    let selectedQuizOption = null;
    let adClicked = false; // Flag to verify ad click

    // --- UI Elements ---
    const screens = document.querySelectorAll('.screen');
    const navButtons = document.querySelectorAll('.nav-btn');
    const headerElements = {
        pic: document.getElementById('profilePic'),
        fullName: document.getElementById('headerFullName'),
        username: document.getElementById('headerUsername'),
        balance: document.getElementById('headerBalance')
    };
    const homeButtons = {
        dailyCheckin: document.getElementById('dailyCheckinBtn'),
        spin: document.getElementById('spinWheelBtn'),
        quiz: document.getElementById('quizBtn')
    };
    const spinScreenElements = {
        backBtn: document.getElementById('spinBackBtn'),
        triggerBtn: document.getElementById('spinTriggerBtn'),
        spinsLeft: document.getElementById('spinsLeft'),
        wheelGroup: document.getElementById('wheelGroup')
    };
    const walletElements = {
        balance: document.getElementById('withdrawBalance'),
        bkashNumber: document.getElementById('bkashNumber'),
        submitBtn: document.getElementById('submitWithdrawBtn')
    };
    const referElements = {
        linkInput: document.getElementById('referralLink'),
        shareBtn: document.getElementById('shareReferralBtn')
    };
    const taskListContainer = document.getElementById('task-list');
    const quizScreenElements = {
        backBtn: document.getElementById('quizBackBtn'),
        progressText: document.getElementById('quiz-progress-text'),
        stepText: document.getElementById('quiz-step-text'),
        progressInner: document.getElementById('quiz-progress-inner'),
        instruction: document.getElementById('quiz-instruction'),
        questionText: document.getElementById('quiz-question-text'),
        optionsContainer: document.getElementById('quiz-options-container'),
        nextBtn: document.getElementById('next-quiz-btn')
    };

    // --- Main Logic ---
    tg.ready();
    tg.expand();
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser = tg.initDataUnsafe.user;
        userRef = db.collection('users').doc(currentUser.id.toString());
        fetchAdminSettings();
        fetchUserData();
        setupEventListeners();
        createSvgWheel();
    } else {
        document.body.innerHTML = "<h1>অনুগ্রহ করে টেলিগ্রাম অ্যাপ থেকে খুলুন।</h1>";
    }

    /**
     * Creates the SVG wheel dynamically with segments, colors, and sparkles.
     */
    function createSvgWheel() {
        const wheelGroup = spinScreenElements.wheelGroup;
        if (!wheelGroup) return;
        wheelGroup.innerHTML = '';
        const numSegments = 10;
        const angle = 360 / numSegments;
        const colors = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#d81b60', '#00acc1', '#fb8c00', '#5e35b1', '#6d4c41'];

        const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
            const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
            return {
                x: centerX + (radius * Math.cos(angleInRadians)),
                y: centerY + (radius * Math.sin(angleInRadians))
            };
        };

        for (let i = 0; i < numSegments; i++) {
            const startAngle = i * angle;
            const endAngle = startAngle + angle;
            const start = polarToCartesian(250, 250, 210, endAngle);
            const end = polarToCartesian(250, 250, 210, startAngle);
            const pathData = `M 250 250 L ${start.x} ${start.y} A 210 210 0 0 0 ${end.x} ${end.y} z`;
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            path.setAttribute("fill", colors[i]);
            path.setAttribute("stroke", "#8d6e63");
            path.setAttribute("stroke-width", "4");
            wheelGroup.appendChild(path);
        }

        for (let i = 0; i < numSegments; i++) {
            const sparkleAngle = (i * angle) + (angle / 2);
            const sparklePos = polarToCartesian(250, 250, 180, sparkleAngle);
            const sparkle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            sparkle.setAttribute("cx", sparklePos.x);
            sparkle.setAttribute("cy", sparklePos.y);
            sparkle.setAttribute("r", "5");
            sparkle.setAttribute("fill", "white");
            sparkle.setAttribute("filter", "url(#glow)");
            wheelGroup.appendChild(sparkle);
        }
    }

    /**
     * Fetches admin settings from Firestore.
     */
    async function fetchAdminSettings() {
        try {
            const appConfigDoc = await db.collection('settings').doc('appConfig').get();
            if (appConfigDoc.exists) appConfig = appConfigDoc.data();

            const spinConfigDoc = await db.collection('settings').doc('spinConfig').get();
            if (spinConfigDoc.exists) spinConfig = spinConfigDoc.data();

            const quizConfigDoc = await db.collection('settings').doc('quizConfig').get();
            if (quizConfigDoc.exists) quizConfig = quizConfigDoc.data();
        } catch (error) {
            handleError("Failed to fetch admin settings.", error);
        }
    }

    /**
     * Fetches and listens to user data from Firestore.
     */
    function fetchUserData() {
        userRef.onSnapshot((doc) => {
            const today = new Date().toISOString().slice(0, 10);
            if (doc.exists) {
                userData = doc.data();
                if (!userData.spinsToday || userData.spinsToday.date !== today) {
                    userData.spinsToday = { date: today, count: 0 };
                }
                if (!userData.completedTasks) {
                    userData.completedTasks = [];
                }
                if (!userData.quizProgress || userData.quizProgress.date !== today) {
                    userData.quizProgress = { date: today, completedToday: 0, currentStep: 0 };
                }
            } else {
                const newUser = {
                    username: currentUser.username || '',
                    fullName: `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim(),
                    balance: 0,
                    lastCheckin: null,
                    spinsToday: { date: today, count: 0 },
                    completedTasks: [],
                    quizProgress: { date: today, completedToday: 0, currentStep: 0 }
                };
                userRef.set(newUser).then(() => {
                    userData = newUser;
                }).catch(error => handleError("Failed to create new user.", error));
            }
            updateUI();
        }, (error) => handleError("Failed to fetch user data.", error));
    }

    /**
     * Generates initials from full name.
     * @param {string} fullName - User's full name.
     * @returns {string} Initials.
     */
    function getInitials(fullName) {
        if (!fullName) return '';
        const names = fullName.split(' ');
        const firstInitial = names[0] ? names[0][0] : '';
        const lastInitial = names.length > 1 ? names[names.length - 1][0] : '';
        return `${firstInitial}${lastInitial}`.toUpperCase();
    }

    /**
     * Updates the UI with user data.
     */
    function updateUI() {
        const balance = userData.balance || 0;
        const fullName = userData.fullName || currentUser.first_name;
        const username = userData.username || currentUser.id;
        const formattedBalance = `৳ ${balance.toFixed(2)}`;

        headerElements.balance.innerText = formattedBalance;
        headerElements.fullName.innerText = fullName;
        headerElements.username.innerText = username ? `@${username}` : `#${currentUser.id}`;
        headerElements.pic.innerText = getInitials(fullName);

        walletElements.balance.innerText = formattedBalance;
        walletElements.submitBtn.disabled = balance < MINIMUM_WITHDRAW_AMOUNT;
        walletElements.submitBtn.innerText = balance < MINIMUM_WITHDRAW_AMOUNT ? `ন্যূনতম ৳${MINIMUM_WITHDRAW_AMOUNT} প্রয়োজন` : "উইথড্র সাবমিট করুন";

        referElements.linkInput.value = `https://t.me/${BOT_USERNAME}?start=${currentUser.id}`;

        const spinsLeftCount = spinConfig.dailyLimit - (userData.spinsToday?.count || 0);
        spinScreenElements.spinsLeft.innerText = spinsLeftCount > 0 ? spinsLeftCount : 0;
    }

    /**
     * Sets up all event listeners.
     */
    function setupEventListeners() {
        navButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const screenId = e.currentTarget.dataset.screen;
                showScreen(screenId);
                if (screenId === 'task-screen') {
                    loadAndDisplayTasks();
                }
            });
        });

        homeButtons.dailyCheckin.addEventListener('click', handleDailyCheckin);
        homeButtons.spin.addEventListener('click', () => showScreen('spin-screen'));
        homeButtons.quiz.addEventListener('click', startQuiz);

        spinScreenElements.backBtn.addEventListener('click', () => showScreen('home-screen'));
        quizScreenElements.backBtn.addEventListener('click', () => showScreen('home-screen'));
        spinScreenElements.triggerBtn.addEventListener('click', handleSpin);
        walletElements.submitBtn.addEventListener('click', handleSubmitWithdraw);
        referElements.shareBtn.addEventListener('click', handleShareReferral);
        taskListContainer.addEventListener('click', handleTaskClick);
        quizScreenElements.optionsContainer.addEventListener('click', handleOptionSelect);
        quizScreenElements.nextBtn.addEventListener('click', handleNextQuiz);
    }

    /**
     * Shows the specified screen and updates navigation.
     * @param {string} screenId - ID of the screen to show.
     */
    function showScreen(screenId) {
        screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.screen === screenId));
    }

    /**
     * Loads and displays active tasks from Firestore.
     */
    async function loadAndDisplayTasks() {
        taskListContainer.innerHTML = '<p>টাস্ক লোড হচ্ছে...</p>';
        try {
            const taskSnapshot = await db.collection('tasks')
                .where('isActive', '==', true)
                .orderBy('createdAt', 'desc')
                .get();

            if (taskSnapshot.empty) {
                taskListContainer.innerHTML = '<p>নতুন টাস্ক শীঘ্রই আসছে...</p>';
                return;
            }

            taskListContainer.innerHTML = '';
            taskSnapshot.forEach(doc => {
                const task = doc.data();
                const taskId = doc.id;
                const isCompleted = userData.completedTasks.includes(taskId);
                const taskElement = document.createElement('div');
                taskElement.className = `task-item ${isCompleted ? 'completed' : ''}`;
                taskElement.dataset.taskId = taskId;
                taskElement.dataset.reward = task.reward;
                taskElement.innerHTML = `
                    <div class="task-item-header">
                        <h3 class="task-title">${task.title}</h3>
                        <span class="task-reward">৳ ${task.reward.toFixed(2)}</span>
                    </div>
                    <p class="task-description">${task.description}</p>
                `;
                taskListContainer.appendChild(taskElement);
            });
        } catch (error) {
            handleError('টাস্ক লোড করতে সমস্যা হয়েছে। সম্ভবত ডেটাবেস ইনডেক্স তৈরি করা হয়নি।', error);
            taskListContainer.innerHTML = '<p>টাস্ক লোড করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।</p>';
        }
    }

    /**
     * Handles task click, shows ad, and rewards user.
     * @param {Event} e - Click event.
     */
    function handleTaskClick(e) {
        const taskItem = e.target.closest('.task-item');
        if (!taskItem || taskItem.classList.contains('completed')) {
            if (taskItem) tg.showAlert('আপনি এই টাস্কটি ইতোমধ্যে সম্পন্ন করেছেন।');
            return;
        }
        const taskId = taskItem.dataset.taskId;
        const reward = parseFloat(taskItem.dataset.reward);
        tg.HapticFeedback.impactOccurred('light');
        window.showGiga()
            .then(() => {
                tg.HapticFeedback.notificationOccurred('success');
                userRef.update({
                    balance: firebase.firestore.FieldValue.increment(reward),
                    completedTasks: firebase.firestore.FieldValue.arrayUnion(taskId)
                }).then(() => {
                    tg.showAlert(`অভিনন্দন! টাস্ক সম্পন্ন করে ৳ ${reward.toFixed(2)} পেয়েছেন।`);
                    taskItem.classList.add('completed');
                }).catch(error => handleError("Failed to update task completion.", error));
            })
            .catch(e => handleError("বিজ্ঞাপন দেখাতে সমস্যা হয়েছে।", e));
    }

    /**
     * Starts the quiz session.
     */
    async function startQuiz() {
        const completedToday = userData.quizProgress?.completedToday || 0;
        if (completedToday >= quizConfig.dailyLimit) {
            tg.showAlert(`আপনি আজকের জন্য আপনার সব কুইজ সম্পন্ন করেছেন।`);
            return;
        }
        showScreen('quiz-screen');
        quizScreenElements.questionText.textContent = 'প্রশ্ন লোড হচ্ছে...';
        quizScreenElements.optionsContainer.innerHTML = '';
        try {
            const snapshot = await db.collection('quizzes').get();
            quizQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (quizQuestions.length === 0) {
                handleError('কোনো কুইজ পাওয়া যায়নি।');
                return;
            }
            quizQuestions.sort(() => 0.5 - Math.random());
            currentQuizIndex = 0;
            displayCurrentQuiz();
        } catch (error) {
            handleError('কুইজ লোড করতে সমস্যা হয়েছে।', error);
        }
    }

    /**
     * Displays the current quiz question and options.
     */
    function displayCurrentQuiz() {
        const completedToday = userData.quizProgress?.completedToday || 0;
        const remaining = quizConfig.dailyLimit - completedToday;
        quizScreenElements.progressText.textContent = `দৈনিক কুইজ সেশন বাকি আছে: ${remaining}`;

        const currentStep = userData.quizProgress?.currentStep || 0;
        const clickTarget = quizConfig.clickTarget;
        quizScreenElements.stepText.textContent = `ধাপ: ${currentStep}/${clickTarget}`;
        quizScreenElements.progressInner.style.width = `${(currentStep / clickTarget) * 100}%`;

        if (currentStep >= clickTarget) {
            userRef.update({ 'quizProgress.currentStep': 0 }).catch(error => handleError("Failed to reset quiz step.", error));
            handleError('একটি অপ্রত্যাশিত সমস্যা হয়েছে, অনুগ্রহ করে আবার শুরু করুন।');
            showScreen('home-screen');
            return;
        }

        if (currentQuizIndex >= quizQuestions.length) currentQuizIndex = 0;
        const quiz = quizQuestions[currentQuizIndex];
        quizScreenElements.questionText.textContent = quiz.question;
        quizScreenElements.optionsContainer.innerHTML = '';
        quiz.options.forEach(optionText => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'quiz-option';
            optionDiv.textContent = optionText;
            quizScreenElements.optionsContainer.appendChild(optionDiv);
        });
        selectedQuizOption = null;
        quizScreenElements.nextBtn.disabled = true;

        if (currentStep === clickTarget - 1) {
            quizScreenElements.instruction.textContent = `এটি শেষ ধাপ! পুরস্কার জিততে বিজ্ঞাপনে ক্লিক করুন।`;
            quizScreenElements.nextBtn.textContent = 'Claim Reward';
        } else {
            quizScreenElements.instruction.textContent = `সঠিক উত্তর দিয়ে পরবর্তী ধাপে যান`;
            quizScreenElements.nextBtn.textContent = 'পরবর্তী কুইজ';
        }
    }

    /**
     * Handles quiz option selection.
     * @param {Event} e - Click event.
     */
    function handleOptionSelect(e) {
        if (!e.target.classList.contains('quiz-option')) return;
        document.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedQuizOption = e.target;
        quizScreenElements.nextBtn.disabled = false;
    }

    /**
     * Handles next quiz button, validates answer, shows ad if needed.
     */
    function handleNextQuiz() {
        if (!selectedQuizOption) return;
        const isCorrect = selectedQuizOption.textContent === quizQuestions[currentQuizIndex].correctAnswer;
        if (!isCorrect) {
            tg.showAlert('ভুল উত্তর! অনুগ্রহ করে সঠিক উত্তরটি নির্বাচন করুন।');
            return;
        }

        quizScreenElements.nextBtn.disabled = true;
        const currentStep = userData.quizProgress?.currentStep || 0;
        const isClickTask = currentStep === quizConfig.clickTarget - 1;

        if (isClickTask) {
            adClicked = false;
            const handleVisibilityChange = () => {
                if (document.visibilityState === 'hidden') {
                    adClicked = true;
                }
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);

            tg.showPopup({
                title: 'গুরুত্বপূর্ণ নির্দেশনা',
                message: 'পুরস্কার পেতে, অনুগ্রহ করে পরবর্তী বিজ্ঞাপনে ক্লিক করুন এবং কমপক্ষে ৩০ সেকেন্ড অপেক্ষা করুন। ক্লিক না করলে ব্যালেন্স যোগ হবে না।',
                buttons: [{ type: 'ok', text: 'ঠিক আছে' }]
            });

            tg.HapticFeedback.impactOccurred('light');
            window.showGiga()
                .then(() => {
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                    if (adClicked) {
                        tg.HapticFeedback.notificationOccurred('success');
                        userRef.update({
                            balance: firebase.firestore.FieldValue.increment(quizConfig.reward),
                            'quizProgress.completedToday': firebase.firestore.FieldValue.increment(1),
                            'quizProgress.currentStep': 0
                        }).then(() => {
                            if (userData.quizProgress) {
                                userData.quizProgress.completedToday++;
                                userData.quizProgress.currentStep = 0;
                            }
                            tg.showAlert(`অভিনন্দন! কুইজ সম্পন্ন করে ৳ ${quizConfig.reward.toFixed(2)} পেয়েছেন।`);
                            showScreen('home-screen');
                        }).catch(error => handleError("Failed to update quiz reward.", error));
                    } else {
                        tg.HapticFeedback.notificationOccurred('error');
                        tg.showAlert("পুরস্কার পেতে বিজ্ঞাপনে ক্লিক করা আবশ্যক। অনুগ্রহ করে আবার চেষ্টা করুন।");
                        quizScreenElements.nextBtn.disabled = false;
                    }
                })
                .catch(e => {
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                    handleError("বিজ্ঞাপন দেখাতে সমস্যা হয়েছে।", e);
                    quizScreenElements.nextBtn.disabled = false;
                });
        } else {
            tg.HapticFeedback.impactOccurred('light');
            window.showGiga()
                .then(() => {
                    tg.HapticFeedback.notificationOccurred('success');
                    userRef.update({
                        'quizProgress.currentStep': firebase.firestore.FieldValue.increment(1)
                    }).then(() => {
                        if (userData.quizProgress) {
                            userData.quizProgress.currentStep++;
                        }
                        currentQuizIndex++;
                        displayCurrentQuiz();
                    }).catch(error => handleError("Failed to update quiz step.", error));
                })
                .catch(e => {
                    handleError("বিজ্ঞাপন দেখাতে সমস্যা হয়েছে।", e);
                    quizScreenElements.nextBtn.disabled = false;
                });
        }
    }

    /**
     * Handles spin wheel action.
     */
    function handleSpin() {
        if (isSpinning) return;
        const spinsLeftCount = spinConfig.dailyLimit - (userData.spinsToday?.count || 0);
        if (spinsLeftCount <= 0) {
            tg.showAlert("আপনার আজকের জন্য আর কোনো স্পিন বাকি নেই।");
            return;
        }
        isSpinning = true;
        spinScreenElements.triggerBtn.disabled = true;
        const randomExtraRotation = Math.floor(Math.random() * 360);
        const totalRotation = currentRotation + (360 * 5) + randomExtraRotation;
        spinScreenElements.wheelGroup.style.transform = `rotate(${totalRotation}deg)`;
        currentRotation = totalRotation;
        setTimeout(spinFinished, 5000);
    }

    /**
     * Finishes spin, shows ad, and rewards user.
     */
    function spinFinished() {
        tg.HapticFeedback.impactOccurred('light');
        window.showGiga()
            .then(() => {
                tg.HapticFeedback.notificationOccurred('success');
                const today = new Date().toISOString().slice(0, 10);
                userRef.update({
                    balance: firebase.firestore.FieldValue.increment(spinConfig.rewardAmount),
                    'spinsToday.date': today,
                    'spinsToday.count': firebase.firestore.FieldValue.increment(1)
                }).then(() => {
                    tg.showAlert(`অভিনন্দন! স্পিন থেকে ৳ ${spinConfig.rewardAmount.toFixed(2)} পেয়েছেন।`);
                }).catch(error => handleError("Failed to update spin reward.", error));
            })
            .catch(e => handleError("বিজ্ঞাপন দেখাতে সমস্যা হয়েছে।", e))
            .finally(() => {
                isSpinning = false;
                spinScreenElements.triggerBtn.disabled = false;
                const finalRotation = currentRotation % 360;
                spinScreenElements.wheelGroup.style.transition = 'none';
                spinScreenElements.wheelGroup.style.transform = `rotate(${finalRotation}deg)`;
                currentRotation = finalRotation;
                setTimeout(() => {
                    spinScreenElements.wheelGroup.style.transition = 'transform 5s cubic-bezier(0.25, 0.1, 0.25, 1)';
                }, 50);
            });
    }

    /**
     * Handles daily check-in.
     */
    function handleDailyCheckin() {
        const today = new Date().toISOString().slice(0, 10);
        if (userData.lastCheckin === today) {
            tg.showAlert("আপনি আজকের বোনাস ইতোমধ্যে সংগ্রহ করেছেন।");
            return;
        }
        this.disabled = true;
        tg.HapticFeedback.impactOccurred('light');
        window.showGiga()
            .then(() => {
                tg.HapticFeedback.notificationOccurred('success');
                userRef.update({
                    balance: firebase.firestore.FieldValue.increment(appConfig.dailyReward),
                    lastCheckin: today
                }).then(() => {
                    tg.showAlert(`অভিনন্দন! Daily Check বোনাস হিসেবে ৳ ${appConfig.dailyReward.toFixed(2)} পেয়েছেন।`);
                }).catch(error => handleError("Failed to update daily check-in.", error));
            })
            .catch(e => handleError("বিজ্ঞাপন দেখাতে সমস্যা হয়েছে।", e))
            .finally(() => {
                this.disabled = false;
            });
    }

    /**
     * Handles withdrawal submission.
     */
    function handleSubmitWithdraw() {
        const bkashNumber = walletElements.bkashNumber.value.trim();
        if (bkashNumber.length < 11 || !/^\d+$/.test(bkashNumber)) {
            tg.showAlert("অনুগ্রহ করে একটি সঠিক বিকাশ নম্বর দিন।");
            return;
        }
        if ((userData.balance || 0) < MINIMUM_WITHDRAW_AMOUNT) {
            tg.showAlert(`ন্যূনতম ৳${MINIMUM_WITHDRAW_AMOUNT} প্রয়োজন।`);
            return;
        }
        this.disabled = true;
        const amountToWithdraw = userData.balance;
        db.collection('withdrawals').add({
            userId: currentUser.id.toString(),
            username: currentUser.username || '',
            amount: amountToWithdraw,
            bkashNumber: bkashNumber,
            status: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            userRef.update({ balance: 0 }).then(() => {
                tg.showAlert("আপনার উইথড্র অনুরোধ সফলভাবে জমা হয়েছে।");
                showScreen('home-screen');
            }).catch(error => handleError("Failed to reset balance after withdrawal.", error));
        }).catch(e => handleError("উইথড্র অনুরোধে সমস্যা হয়েছে।", e))
        .finally(() => {
            this.disabled = false;
            walletElements.bkashNumber.value = '';
        });
    }

    /**
     * Handles referral sharing.
     */
    function handleShareReferral() {
        const link = referElements.linkInput.value;
        const text = `এখানে প্রতিদিন আয় করুন! আমার রেফারেল লিংক দিয়ে জয়েন করুন: ${link}`;
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    }

    /**
     * Handles errors uniformly.
     * @param {string|Object} message - Error message or snapshot.
     * @param {Error} [error] - Optional error object.
     */
    function handleError(message, error) {
        if (error) {
            console.error("Error:", error);
        }
        if (typeof message === 'string') {
            tg.showAlert(message);
        } else {
            console.error("Snapshot Error:", message);
            tg.showAlert("একটি অপ্রত্যাশিত সমস্যা হয়েছে।");
        }
    }
});