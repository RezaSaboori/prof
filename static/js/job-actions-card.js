/**
 * Job Actions Card module
 * Handles tab toggling between "Find Jobs" and "Take a Job",
 * and controls the number stepper.
 */
(function () {
    'use strict';

    function initJobActionsCard() {
        var card = document.getElementById('jobActionsCard');
        if (!card) return;

        var toggleBtns = card.querySelectorAll('.job-actions-toggle__btn');
        var findPanel = document.getElementById('findJobsPanel');
        var takePanel = document.getElementById('takeJobPanel');
        var stepperInput = document.getElementById('jobStepperInput');
        var stepperUp = document.getElementById('jobStepperUp');
        var stepperDown = document.getElementById('jobStepperDown');

        toggleBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var targetMode = btn.getAttribute('data-mode');

                toggleBtns.forEach(function (b) {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });

                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');

                if (targetMode === 'find') {
                    if (findPanel) findPanel.removeAttribute('hidden');
                    if (takePanel) takePanel.setAttribute('hidden', '');
                } else {
                    if (findPanel) findPanel.setAttribute('hidden', '');
                    if (takePanel) takePanel.removeAttribute('hidden');
                }
            });
        });

        if (stepperUp && stepperInput) {
            stepperUp.addEventListener('click', function () {
                var currentVal = parseInt(stepperInput.value, 10);
                if (isNaN(currentVal)) currentVal = 0;
                stepperInput.value = currentVal + 1;
                stepperInput.dispatchEvent(new Event('change'));
            });
        }

        if (stepperDown && stepperInput) {
            stepperDown.addEventListener('click', function () {
                var currentVal = parseInt(stepperInput.value, 10);
                if (isNaN(currentVal)) currentVal = 1;
                var min = parseInt(stepperInput.getAttribute('min'), 10);
                if (isNaN(min)) min = 1;
                if (currentVal > min) {
                    stepperInput.value = currentVal - 1;
                    stepperInput.dispatchEvent(new Event('change'));
                }
            });
        }

        var linkInput = document.getElementById('takeJobLinkInput');
        var submitBtn = document.getElementById('takeJobSubmitBtn');

        function updateSubmitButtonState() {
            if (!submitBtn || !linkInput) return;
            var hasValue = linkInput.value.trim().length > 0;
            if (hasValue) {
                submitBtn.classList.remove('glass');
                submitBtn.classList.add('blue-glass');
            } else {
                submitBtn.classList.remove('blue-glass');
                submitBtn.classList.add('glass');
            }
        }

        if (linkInput && submitBtn) {
            linkInput.addEventListener('input', updateSubmitButtonState);
            linkInput.addEventListener('change', updateSubmitButtonState);
            updateSubmitButtonState();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initJobActionsCard);
    } else {
        initJobActionsCard();
    }
})();