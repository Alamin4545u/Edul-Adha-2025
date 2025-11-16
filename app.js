document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://wcmgdhyizhykqblndnhx.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbWdkaHlpemh5a3FibG5kbmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMzM0MjAsImV4cCI6MjA3ODgwOTQyMH0.XuBmH3m0IMgdKen-By42CYlMMC9hhiijr_kDRqWJrp4';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const tg = window.Telegram.WebApp;

    // DOM Elements
    const nameElem = document.getElementById('name');
    const balanceElem = document.getElementById('balance');
    const adViewsElem = document.getElementById('ad-views');
    const watchAdBtn = document.getElementById('watch-ad-btn');
    const statusElem = document.getElementById('status');
    const taskListElem = document.getElementById('task-list');
    const withdrawBtn = document.getElementById('withdraw-btn');
    const modal = document.getElementById('withdraw-modal');
    const closeBtn = document.querySelector('.close');
    const withdrawForm = document.getElementById('withdraw-form');
    const methodSelect = document.getElementById('method');
    const amountSelect = document.getElementById('amount');
    const numberInput = document.getElementById('number');
    const withdrawStatus = document.getElementById('withdraw-status');
    const body = document.body;
    const confetti = document.getElementById('confetti');

    let currentUser = null;
    let withdrawMethods = [];
    let gigaLoaded = false;
    let startX = 0;

    // Premium: Theme & Confetti
    function initTheme() {
        const theme = tg.colorScheme || 'light';
        body.setAttribute('data-theme', theme);
        tg.setHeaderColor(theme === 'dark' ? '#0f172a' : '#f8fafc');
    }

    function showConfetti() {
        confetti.innerHTML = '';
        for (let i = 0; i < 50; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = Math.random() * 100 + 'vw';
            piece.style.background = `hsl(${Math.random() * 360}, 70%, 60%)`;
            piece.style.animationDelay = Math.random() * 3 + 's';
            confetti.appendChild(piece);
        }
        setTimeout(() => confetti.innerHTML = '', 3000);
    }

    // Initialize App
    async function initializeApp() {
        tg.ready();
        tg.expand();
        initTheme();
        tg.MainButton.setText('Earn More').show().onClick(() => watchAdBtn.click());

        // Swipe for Tabs
        document.addEventListener('touchstart', e => startX = e.touches[0].clientX);
        document.addEventListener('touchend', e => {
            const endX = e.changedTouches[0].clientX;
            if (startX - endX > 50) document.querySelector('[data-tab="tasks"]').click();
            if (endX - startX > 50) document.querySelector('[data-tab="home"]').click();
        });

        statusElem.textContent = 'Loading...';
        const tgUser = tg.initDataUnsafe?.user;
        if (!tgUser) { showError('User not found.'); return; }

        try {
            let { data: user } = await supabase.from('users').select('*').eq('telegram_id', tgUser.id).maybeSingle();
            if (!user) {
                const { data: newUser } = await supabase.from('users').insert({
                    telegram_id: tgUser.id,
                    first_name: tgUser.first_name || 'User',
                    last_name: tgUser.last_name || '',
                    username: tgUser.username || ''
                }).select().single();
                user = newUser;
            }
            if (user.is_banned) {
                document.body.innerHTML = '<h1 style="text-align:center;color:red;">Banned</h1>';
                return;
            }
            currentUser = user;
            updateUserUI();
            await loadWithdrawMethods();
            await loadTasks();
            await loadAdService();
            statusElem.textContent = 'Ready!';
        } catch (err) {
            showError(`Error: ${err.message}`);
        }
    }

    function updateUserUI() {
        if (!currentUser) return;
        nameElem.textContent = currentUser.first_name || 'User';
        const balance = parseFloat(currentUser.balance || 0).toFixed(2);
        balanceElem.textContent = `৳${balance}`;
        balanceElem.style.background = `linear-gradient(135deg, ${balance > 50 ? '#10b981' : '#3b82f6'}, #f59e0b)`;
        adViewsElem.textContent = currentUser.ad_views || 0;
        statusElem.textContent = '';
    }

    // Load Ad Service
    async function loadAdService() {
        const { data: settings } = await supabase.from('settings').select('giga_app_id').single();
        if (!settings?.giga_app_id) { showError('Ad not configured.'); return; }

        if (document.querySelector(`script[src*="gigapub.tech"]`)) {
            gigaLoaded = true;
            watchAdBtn.disabled = false;
            return;
        }

        const script = document.createElement('script');
        script.src = `https://ad.gigapub.tech/script?id=${settings.giga_app_id}`;
        script.onload = () => {
            gigaLoaded = typeof window.showGiga === 'function';
            if (gigaLoaded) watchAdBtn.disabled = false;
            else showError('Ad failed to load.');
        };
        script.onerror = () => showError('Ad script error.');
        document.head.appendChild(script);
    }

    // Tab Switching
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // Load Tasks
    async function loadTasks() {
        taskListElem.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">Loading...</p>';
        const { data: tasks } = await supabase.from('tasks').select('*').eq('is_active', true).order('id');
        const { data: progress } = await supabase.from('user_task_progress').select('*').eq('user_telegram_id', currentUser.telegram_id);

        if (!tasks?.length) {
            taskListElem.innerHTML = '<p class="error">No tasks.</p>';
            return;
        }

        taskListElem.innerHTML = '';
        tasks.forEach(task => {
            const prog = progress?.find(p => p.task_id === task.id) || { ads_watched: 0, completed: false };
            const percent = Math.min((prog.ads_watched / task.required_ads) * 100, 100);

            const card = document.createElement('div');
            card.className = 'task-card';
            card.innerHTML = `
                <div style="font-size:2rem;margin-bottom:10px;">Target</div>
                <h3>${task.title}</h3>
                <p>${task.description || ''}</p>
                <p>Reward: <b>৳${task.reward}</b></p>
                <div class="progress-bar"><div style="width:${percent}%"></div></div>
                <p>Progress: ${prog.ads_watched}/${task.required_ads}</p>
                <button class="btn btn-green task-btn" data-task-id="${task.id}" ${prog.completed ? 'disabled' : ''}>
                    ${prog.completed ? 'Completed' : 'Watch Ad'}
                </button>
            `;
            taskListElem.appendChild(card);
        });

        document.querySelectorAll('.task-btn').forEach(btn => {
            btn.onclick = () => handleTaskAd(btn);
        });
    }

    // Handle Task Ad
    async function handleTaskAd(btn) {
        if (!gigaLoaded) return showError('Ad not ready.');
        btn.disabled = true;
        btn.textContent = 'Loading...';

        try {
            await window.showGiga();
            const { data, error } = await supabase.rpc('update_task_progress', {
                task_id_param: parseInt(btn.dataset.taskId),
                user_id_param: currentUser.telegram_id
            });
            if (error) throw error;
            const result = data[0];
            currentUser.balance = result.new_balance;
            updateUserUI();
            await loadTasks();
            if (result.is_completed) {
                showSuccess(`Task Done! +৳${result.reward_amount}`);
                showConfetti();
            } else {
                showSuccess('Ad watched!');
            }
        } catch (err) {
            showError('Ad failed.');
            btn.disabled = false;
            btn.textContent = 'Watch Ad';
        }
    }

    // Direct Ad
    watchAdBtn.onclick = async () => {
        if (!gigaLoaded) return showError('Ad not ready.');
        tg.HapticFeedback.impactOccurred('medium');
        watchAdBtn.disabled = true;
        showStatus('Loading ad...');

        try {
            await window.showGiga();
            const { data, error } = await supabase.rpc('claim_reward', { user_telegram_id: currentUser.telegram_id });
            if (error) throw error;
            const result = data[0];
            currentUser.balance = result.new_balance;
            currentUser.ad_views = result.new_ad_views;
            updateUserUI();
            showSuccess('Reward! Money');
            showConfetti();
        } catch (err) {
            showError('Ad failed.');
        } finally {
            watchAdBtn.disabled = false;
        }
    };

    // Withdraw
    async function loadWithdrawMethods() {
        const { data } = await supabase.from('withdraw_methods').select('*').eq('is_active', true);
        withdrawMethods = data || [];
    }

    withdrawBtn.onclick = () => {
        if (!withdrawMethods.length) return showError('No methods.');
        methodSelect.innerHTML = withdrawMethods.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
        updateAmountOptions();
        modal.style.display = 'flex';
    };

    closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };

    methodSelect.onchange = updateAmountOptions;
    function updateAmountOptions() {
        const method = withdrawMethods.find(m => m.name === methodSelect.value);
        if (method) {
            amountSelect.innerHTML = method.amounts.map(a => `<option value="${a}">৳${a}</option>`).join('');
        }
    }

    withdrawForm.onsubmit = async e => {
        e.preventDefault();
        if (!numberInput.value.match(/^\d{11}$/)) return showWithdrawError('11-digit number required.');

        const amount = parseFloat(amountSelect.value);
        if (currentUser.balance < amount) return showWithdrawError('Low balance.');

        const { error } = await supabase.from('withdraw_requests').insert({
            user_id: currentUser.telegram_id,
            method: methodSelect.value,
            amount,
            account_number: numberInput.value
        });

        if (error) {
            showWithdrawError(`Error: ${error.message}`);
        } else {
            currentUser.balance -= amount;
            await supabase.from('users').update({ balance: currentUser.balance }).eq('telegram_id', currentUser.telegram_id);
            updateUserUI();
            showWithdrawSuccess('Sent!');
            showConfetti();
            setTimeout(() => modal.style.display = 'none', 2000);
        }
    };

    // Helpers
    function showError(msg) { statusElem.textContent = `Error: ${msg}`; statusElem.className = 'error'; }
    function showSuccess(msg) { statusElem.textContent = `Success: ${msg}`; statusElem.className = 'success'; }
    function showStatus(msg) { statusElem.textContent = msg; statusElem.className = ''; }
    function showWithdrawError(msg) { withdrawStatus.textContent = `Error: ${msg}`; withdrawStatus.className = 'error'; }
    function showWithdrawSuccess(msg) { withdrawStatus.textContent = `Success: ${msg}`; withdrawStatus.className = 'success'; }

    initializeApp();
});
