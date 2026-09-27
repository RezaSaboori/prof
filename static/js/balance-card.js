(function () {
    'use strict';

    const cardEl = document.getElementById('balanceCard');
    const valueEl = document.getElementById('balanceValue');
    const addFundsBtn = document.getElementById('addFundsBtn');
    const modalEl = document.getElementById('balanceTopupModal');
    const formEl = document.getElementById('balanceTopupForm');
    const amountInput = document.getElementById('balanceTopupAmount');
    const errorEl = document.getElementById('balanceTopupError');
    const submitBtn = document.getElementById('balanceTopupSubmit');

    if (!cardEl || !valueEl) return;

    const balanceUrl = cardEl.dataset.balanceUrl;
    const checkoutUrl = cardEl.dataset.checkoutUrl;

    function loadBalance() {
        return fetch(balanceUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
        })
            .then(function (res) {
                if (!res.ok) {
                    throw new Error('HTTP ' + res.status);
                }

                return res.json();
            })
            .then(function (data) {
                const num = Number.parseFloat(data.balance);

                if (!Number.isFinite(num)) {
                    throw new Error('Invalid balance.');
                }

                valueEl.textContent = num.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                });

                valueEl.classList.remove('balance-card__value--error');
            })
            .catch(function () {
                valueEl.textContent = 'Unavailable';
                valueEl.classList.add('balance-card__value--error');
            });
    }

    function clearError() {
        if (!errorEl) return;

        errorEl.textContent = '';
        errorEl.hidden = true;
    }

    function showError(message) {
        if (!errorEl) return;

        errorEl.textContent = message;
        errorEl.hidden = false;
    }

    function openModal() {
        if (!modalEl || !amountInput) return;

        clearError();
        amountInput.value = '';
        modalEl.hidden = false;
        document.body.classList.add('balance-topup-open');

        window.requestAnimationFrame(function () {
            amountInput.focus();
        });
    }

    function closeModal() {
        if (!modalEl || (submitBtn && submitBtn.disabled)) return;

        modalEl.hidden = true;
        document.body.classList.remove('balance-topup-open');
        clearError();

        if (addFundsBtn) {
            addFundsBtn.focus();
        }
    }

    function getCsrfToken() {
        if (!formEl) return '';

        const input = formEl.querySelector('[name=csrfmiddlewaretoken]');
        return input ? input.value : '';
    }

    if (addFundsBtn) {
        addFundsBtn.addEventListener('click', openModal);
    }

    if (modalEl) {
        modalEl.querySelectorAll('[data-balance-close]').forEach(function (element) {
            element.addEventListener('click', closeModal);
        });
    }

    document.addEventListener('keydown', function (event) {
        if (
            event.key === 'Escape'
            && modalEl
            && !modalEl.hidden
        ) {
            closeModal();
        }
    });

    if (formEl && amountInput && submitBtn) {
        formEl.addEventListener('submit', function (event) {
            event.preventDefault();
            clearError();

            if (!amountInput.checkValidity()) {
                amountInput.reportValidity();
                return;
            }

            const originalText = submitBtn.textContent;
            let redirecting = false;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Redirecting...';

            fetch(checkoutUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    amount: amountInput.value,
                }),
            })
                .then(function (response) {
                    return response.json().then(function (data) {
                        if (!response.ok) {
                            throw new Error(
                                data.error || 'Could not start payment.'
                            );
                        }

                        return data;
                    });
                })
                .then(function (data) {
                    if (!data.checkout_url) {
                        throw new Error('Stripe checkout URL was not returned.');
                    }

                    redirecting = true;
                    window.location.assign(data.checkout_url);
                })
                .catch(function (error) {
                    showError(
                        error.message || 'Could not start payment.'
                    );
                })
                .finally(function () {
                    if (!redirecting) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = originalText;
                    }
                });
        });
    }

    loadBalance();

    const query = new URLSearchParams(window.location.search);

    if (query.get('funds') === 'success') {
        window.setTimeout(loadBalance, 1500);
        window.setTimeout(loadBalance, 3000);
    }
}());