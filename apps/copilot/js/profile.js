/* Meditation Copilot — practitioner profile: New Seeker or Initiated Member
 * Stored in MC.profile (synced with the user's own drive):
 *   userType:     'seeker' | 'initiated'
 *   start:        initiation date for initiates (same value as the Roadmap "journey began" answer)
 *   initiatedBy:  one of MASTERS
 * Privacy: never sent to usage statistics or included in diagnostics.
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  MC.MASTERS = [
    'Sant Rajinder Singh Ji Maharaj',
    'Sant Darshan Singh Ji Maharaj',
    'Sant Kirpal Singh Ji Maharaj',
    'Baba Sawan Singh Ji Maharaj',
    'Other'
  ];
  var dlg = $('typeDlg'), firstTime = false;
  function open() { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  function close() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  // v0.23: Seeker → Initiate is one way. Initiates can correct their date and Master but not switch back; an admin can revoke it.
  var editing = false;
  function showStep(initiated) {
    $('tyStep1').hidden = initiated;
    $('tyStep2').hidden = !initiated;
    if (initiated) {
      $('tyDate').max = MC.toISO(MC.today()); $('tyDate').min = '';
      $('tyDate').value = MC.profile.start || '';
      $('tyBy').value = MC.profile.initiatedBy || '';
      $('tyErr').textContent = '';
      $('tyOnce').hidden = MC.isInitiated();
      $('tyBack').hidden = editing;          // no way back to "new seeker" from here
    }
  }

  // Ask (first time) or edit: an initiate corrects their details; a seeker says they've been initiated
  MC.askUserType = function (edit) {
    if (edit && MC.isSeeker() && MC.profile.initiateRevoked) { MC.toast('Please speak with the center team about your initiation details.', 5000); return; }
    firstTime = !edit; editing = !!edit;
    $('tyCancel').hidden = firstTime;
    $('tyTitle').textContent = !edit ? 'Welcome 🙏' : MC.isInitiated() ? 'Your initiation details' : 'I’ve been initiated';
    showStep(!!edit);
    open();
  };
  // v0.24: nobody is asked at sign-in any more: everyone starts as a seeker; "I've been initiated" is on the Roadmap (once)
  MC.maybeAskUserType = function () {
    if (!MC.account.signedIn() || MC.profile.userType) return;
    MC.profile.userType = 'seeker'; MC.saveProfile(); MC.emit('profile');
  };

  $('tyYes').addEventListener('click', function () { showStep(true); });
  $('tyNo').addEventListener('click', function () {
    if (MC.isInitiated()) { close(); return; }
    var was = MC.profile.userType;
    MC.profile.userType = 'seeker';
    MC.saveProfile(); MC.emit('profile');
    close();
    if (was !== 'seeker') MC.toast('Welcome, seeker. 🌱', 3000);
    MC.go(firstTime ? 'roadmap' : MC.current || 'home');
  });
  $('tyBack').addEventListener('click', function () { showStep(false); });
  $('tyCancel').addEventListener('click', close);
  dlg.addEventListener('cancel', function (e) { if (firstTime) e.preventDefault(); });   // must choose on first launch

  $('tyForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = MC.parseDate($('tyDate').value), by = $('tyBy').value, err = '';
    if (!d) err = 'Please enter your initiation date.';
    else if (d > MC.today()) err = 'The date can’t be in the future.';
    else if (d.getFullYear() < 1900) err = 'Please check the year.';
    else if (MC.MASTERS.indexOf(by) < 0) err = 'Please choose who initiated you.';
    if (err) { $('tyErr').textContent = err; return; }
    var was = MC.profile.userType;
    if (was !== 'initiated' && !firstTime && !window.confirm('Save that you’ve been initiated? You can’t switch back to seeker afterwards.')) return;
    MC.profile.userType = 'initiated';
    MC.profile.start = $('tyDate').value;          // the start of the 10,000-hour journey
    MC.profile.initiatedBy = by;
    MC.saveProfile(); MC.emit('profile');
    close();
    if (was !== 'initiated') MC.toast('Thank you 🪷 The 10,000-hour journey is now open to you on the Roadmap.', 4500);
    else MC.toast('Details saved.');
    MC.go(firstTime || was !== 'initiated' ? 'roadmap' : MC.current || 'home');
  });
})();
