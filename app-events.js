(() => {
  function handleAction(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const action = trigger.dataset.action;
    const index = trigger.dataset.index;

    switch (action) {
      case 'open-settings':
        if (typeof openModal === 'function') openModal('settingsModal');
        break;
      case 'toggle-combo':
        if (typeof toggleCombo === 'function') toggleCombo();
        break;
      case 'prev-month':
        if (typeof changeMonth === 'function') changeMonth(-1);
        break;
      case 'next-month':
        if (typeof changeMonth === 'function') changeMonth(1);
        break;
      case 'copy-previous-month':
        if (typeof copyFromPreviousMonth === 'function') copyFromPreviousMonth();
        break;
      case 'clear-month':
        if (typeof clearMonth === 'function') clearMonth();
        break;
      case 'prev-year':
        if (typeof changeYear === 'function') changeYear(-1);
        break;
      case 'next-year':
        if (typeof changeYear === 'function') changeYear(1);
        break;
      case 'print-year-summary':
        if (typeof printYearSummary === 'function') printYearSummary();
        break;
      case 'export-backup':
        if (typeof exportBackup === 'function') exportBackup();
        break;
      case 'import-backup': {
        const input = document.getElementById('importInput');
        if (input) input.click();
        break;
      }
      case 'generate-all-forms':
        if (typeof generateAllForms === 'function') generateAllForms();
        break;
      case 'add-child':
        if (typeof addChildField === 'function') addChildField();
        break;
      case 'save-settings':
        if (typeof saveSettings === 'function') saveSettings();
        break;
      case 'close-settings':
        if (typeof closeModal === 'function') closeModal('settingsModal');
        break;
      case 'remove-child': {
        const childIndex = Number(index);
        if (typeof removeChildField === 'function' && Number.isFinite(childIndex)) {
          removeChildField(childIndex);
        }
        break;
      }
      default:
        break;
    }
  }

  document.addEventListener('click', handleAction);
})();
