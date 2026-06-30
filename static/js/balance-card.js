(function () {
    'use strict';

    const valueEl = document.getElementById('balanceValue');
    if (!valueEl) return;

    fetch('/dashboard/api/balance/', {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    })
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function (data) {
            const raw = data.balance;
            const num = parseFloat(raw);
            if (isNaN(num)) throw new Error('invalid');
            const formatted = num.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            });
            valueEl.textContent = formatted;
        })
        .catch(function () {
            valueEl.textContent = 'Unavailable';
            valueEl.classList.add('balance-card__value--error');
        });
}());