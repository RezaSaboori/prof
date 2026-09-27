(function () {
    var form = document.getElementById('pinForm');
    var input = document.getElementById('pinInput');
    var box = document.querySelector('.pin-box');
    var errorEl = document.getElementById('pinError');

    if (!form || !input) {
        return;
    }

    input.focus();

    input.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '');
        this.classList.remove('pin-input-error');
    });

    if (errorEl && box) {
        input.classList.add('pin-input-error');
        box.classList.add('pin-shake');
        box.addEventListener('animationend', function () {
            box.classList.remove('pin-shake');
        }, { once: true });
    }

    form.addEventListener('submit', function () {
        input.value = input.value.trim();
    });
})();