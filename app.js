document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://wcmgdhyizhykqblndnhx.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbWdkaHlpemh5a3FibG5kbmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMzM0MjAsImV4cCI6MjA3ODgwOTQyMH0.XuBmH3m0IMgdKen-By42CYlMMC9hhiijr_kDRqWJrp4';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const tg = window.Telegram.WebApp;

    // DOM
    const profilePic = document.getElementById('profile-pic');
    const usernameElem = document.getElementById('username');
    const userIdElem = document.getElementById('user-id');
    const balanceElem = document.getElementById('balance');
    const adViewsElem = document.getElementById('ad-views');
    const watchAdBtn = document.getElementById('watch-ad-btn');
    const statusElem = document.getElementById('status');
    const taskList = document.getElementById('task-list');
    const withdrawBtn = document.getElementById('withdraw-btn');
    const modal = document.getElementById('withdraw-modal');
    const closeBtn = document.querySelector('.close');
    const withdrawForm = document.getElementById('withdraw-form');
    const methodSelect = document.getElementById('method');
    const amountSelect = document.getElementById('amount');
    const numberInput = document.getElementById('number');
    const withdrawStatus = document.getElementById('withdraw-status');
    const checkinCard = document.getElementById('daily-checkin');
    const checkinBtn = document.getElementById('checkin-btn');
    const checkinReward = document.getElementById('checkin-reward');
    const confetti = document.getElementById('confetti');

    let currentUser = null;
    let settings = {};
    let gigaLoaded = false;

    // Theme
    function initTheme() {
        const theme = tg.colorScheme || 'light';
        document.body.setAttribute('data-theme', theme);
        tg.setHeaderColor(theme === 'dark' ? '#0f172a' : '#f8fafc');
    }

    // Confetti
    function showConfetti() {
        confetti.innerHTML = '';
        for (let i = 0; i < 40; i++) {
            const p = document.createElement('div');
            p.className = 'confetti-piece';
            p.style.left = Math.random() * 100 + 'vw';
            p.style.background = `hsl(${Math.random()*360}, 70%, 60%)`;
            p.style.animationDelay = Math.random() * 3 + 's';
            confetti.appendChild(p);
        }
        setTimeout(() => confetti.innerHTML = '', 3000);
    }

    // Initialize
    async function init() {
        tg.ready(); tg.expand(); initTheme();
        tg.MainButton.setText('Earn More').show().onClick(() => watchAdBtn.click());

        const tgUser = tg.initDataUnsafe?.user;
        if (!tgUser) return showError('User not found');

        // Profile
        profilePic.src = tgUser.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(tgUser.first_name)}&background=3b82f6&color=fff&size=128`;
        usernameElem.textContent = `${tgUser.first_name} ${tgUser.last_name || ''}`.trim();
        userIdElem.textContent = `@${tgUser.username || tgUser.id}`;

        try {
            let { data: user } = await supabase.fromfrom('users').select('*').eq('telegram_id', tgUser.id).maybeSingle();
            if (!user) {
                const { data: newUser } = await supabase.from('users').insert({
                    telegram_id: tgUser.id,
                    first_name: tgUser.first_name,
                    last_name: tgUser.last_name || '',
                    username: tgUser.username || ''
                }).select().single();
                user = newUser;
            }
            if (user.is_banned) return document.body.innerHTML = '<h1 style="text-align:center;color:red;">Banned</h1>';
            currentUser = user;
            updateUI();

            await Promise.all([loadSettings(), loadWithdrawMethods(), loadAdService(), loadDailyCheckin()]);
            startRealtimeUpdates();
        } catch (err) { showError(err.message); }
    }

    // Realtime
    function startRealtimeUpdates() {
        setInterval(async () => {
            if (!currentUser) return;
            const { data } = await supabase.from('users').select('balance, ad_views').eq('telegram_id', currentUser.telegram_id).single();
            if (data) {
                currentUser.balance = data.balance;
                currentUser.ad_views = data.ad_views;
                updateUI();
            }
            await loadDailyCheckin();
        }, 3000);
    }

    function updateUI() {
        balanceElem.textContent = `৳${parseFloat(currentUser.balance || 0).toFixed(2)}`;
        adViewsElem.textContent = currentUser.ad_views || 0;
    }

    // Settings
    async function loadSettings() {
        const { data } = await supabase.from('settings').select('*').single();
        settings = data || {};
        if (settings.main_button_reward) {
            tg.MainButton.setText(`Earn ৳${settings.main_button_reward}`).onClick(() => watchAdBtn.click());
        }
    }

    // Ad Service
    async function loadAdService() {
        if (!settings.giga_app_id) return;
        const script = document.createElement('script');
        script.src = `https://ad.gigapub.tech/script?id=${settings.giga_app_id}`;
        script.onload = () => { gigaLoaded = true; watchAdBtn.disabled = false; };
        document.head.appendChild(script);
    }

    // Daily Check-in
    async function loadDailyCheckin() {
        const today = new Date().toISOString().split('T')[0];
        const { data: record } = await supabase.from('daily_checkins').select('*').eq('user_id', currentUser.telegram_id).eq('date', today).maybeSingle();
        const hasChecked = !!record;

        if (settings.daily_checkin_enabled && !hasChecked) {
            checkinCard.style.display = 'block';
            checkinReward.textContent = `৳${settings.daily_checkin_reward || 0.10}`;
            checkinBtn.onclick = () => handleDailyCheckin();
        } else {
            checkinCard.style.display = 'none';
        }
    }

    async function handleDailyCheckin() {
        if (!gigaLoaded) return showError('Ad not ready');
        checkinBtn.textContent = 'Loading...';
        try {
            await window.showGiga();
            const { data, error } = await supabase.rpc('claim_daily_checkin', { user_telegram_id: currentUser.telegram_id });
            if (error) throw error;
            currentUser.balance = data.new_balance;
            updateUI();
            showSuccess(`+৳${settings.daily_checkin_reward} added!`);
            showConfetti();
            loadDailyCheckin();
        } catch { checkinBtn.textContent = 'Check-in Now'; }
    }

    // Load Tasks (Only in Tasks Tab)
    window.loadTasks = async function() {
        if (document.querySelector('[data-tab="tasks"]').classList.contains('active')) {
            const { data: tasks } = await supabase.from('tasks').select('*').eq('is_active', true);
            const { data: progress } = await supabase.from('user_task_progress').select('*').eq('user_telegram_id', currentUser.telegram_id);
            taskList.innerHTML = tasks?.length ? '' : '<p style="text-align:center;color:var(--text-light);">No tasks</p>';

            tasks?.forEach(task => {
                const prog = progress?.find(p => p.task_id === task.id) || { ads_watched: 0, completed: false };
                const percent = Math.min((prog.ads_watched / task.required_ads) * 100, 100);
                const card = document.createElement('div');
                card.className = 'task-card';
                card.innerHTML = `
                    <div class="task-title"><span class="task-emoji">${task.emoji || 'Target'}</span> ${task.title}</div>
                    <div class="task-desc">${task.description}</div>
                    <div class="task-reward">Reward: ৳${task.reward}</div>
                    <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
                    <div class="task-progress">Progress: ${prog.ads_watched}/${task.required_ads}</div>
                    <button class="btn ${prog.completed ? 'btn-green' : 'btn-blue'} task-btn" data-id="${task.id}" ${prog.completed ? 'disabled' : ''}>
                        ${prog.completed ? 'Completed' : 'Watch Ad'}
                    </button>
                `;
                taskList.appendChild(card);
            });

            document.querySelectorAll('.task-btn').forEach(btn => {
                btn.onclick = () => handleTask(btn);
            });
        }
    };

    async function handleTask(btn) {
        const taskId = btn.dataset.id;
        btn.disabled = true; btn.textContent = 'Loading...';
        try {
            await window.showGiga();
            const { data, error } = await supabase.rpc('update_task_progress', { task_id_param: +taskId, user_id_param: currentUser.telegram_id });
            if (error) throw error;
            currentUser.balance = data[0].new_balance;
            updateUI();
            loadTasks();
            showSuccess(data[0].is_completed ? `+৳${data[0].reward_amount}` : 'Ad watched');
            if (data[0].is_completed) showConfetti();
        } catch { btn.disabled = false; btn.textContent = 'Watch Ad'; }
    }

    // Watch Ad
    watchAdBtn.onclick = async () => {
        if (!gigaLoaded) return;
        watchAdBtn.disabled = true;
        try {
            await window.showGiga();
            const { data, error } = await supabase.rpc('claim_reward', { user_telegram_id: currentUser.telegram_id });
            if (error) throw error;
            currentUser.balance = data[0].new_balance;
            currentUser.ad_views = data[0].new_ad_views;
            updateUI();
            showSuccess('Reward added!');
            showConfetti();
        } catch { } finally { watchAdBtn.disabled = false; }
    };

    // Withdraw
    let withdrawMethods = [];
    async function loadWithdrawMethods() {
        const { data } = await supabase.from('withdraw_methods').select('*').eq('is_active', true);
        withdrawMethods = data || [];
    }

    withdrawBtn.onclick = () => {
        if (!withdrawMethods.length) return showError('No methods');
        methodSelect.innerHTML = withdrawMethods.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
        const m = withdrawMethods[0];
        amountSelect.innerHTML = m.amounts.map(a => `<option value="${a}">৳${a}</option>`).join('');
        modal.style.display = 'flex';
    };

    methodSelect.onchange = () => {
        const m = withdrawMethods.find(x => x.name === methodSelect.value);
        amountSelect.innerHTML = m.amounts.map(a => `<option value="${a}">৳${a}</option>`).join('');
    };

    withdrawForm.onsubmit = async e => {
        e.preventDefault();
        if (!/^\d{11}$/.test(numberInput.value)) return showWithdrawError('11 digits');
        const amount = +amountSelect.value;
        if (currentUser.balance < amount) return showWithdrawError('Low balance');

        const { error } = await supabase.from('withdraw_requests').insert({
            user_id: currentUser.telegram_id,
            method: methodSelect.value,
            amount, account_number: numberInput.value
        });

        if (error) showWithdrawError(error.message);
        else {
            currentUser.balance -= amount;
            updateUI();
            showWithdrawSuccess('Sent!');
            showConfetti();
            setTimeout(() => modal.style.display = 'none', 2000);
        }
    };

    closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };

    // Tab Switch
    document.querySelectorAll('.tab').forEach(t => {
        t.onclick = () => {
            document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            document.getElementById(t.dataset.tab).classList.add('active');
            if (t.dataset.tab === 'tasks') loadTasks();
        };
    });

    // Helpers
    function showError(msg) { statusElem.textContent = `Error: ${msg}`; statusElem.className = 'error'; }
    function showSuccess(msg) { statusElem.textContent = `Success: ${msg}`; statusElem.className = 'success'; }
    function showWithdrawError(msg) { withdrawStatus.textContent = `Error: ${msg}`; withdrawStatus.className = 'error'; }
    function showWithdrawSuccess(msg) { withdrawStatus.textContent = `Success: ${msg}`; withdrawStatus.className = 'success'; }

    init();
});
