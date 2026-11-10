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

  function showStep(initiated) {
    $('tyStep1').hidden = initiated;
    $('tyStep2').hidden = !initiated;
    if (initiated) {
      $('tyDate').max = MC.toISO(MC.today());
      if (MC.profile.dob) $('tyDate').min = MC.profile.dob;
      $('tyDate').value = MC.profile.start || '';
      $('tyBy').value = MC.profile.initiatedBy || '';
      $('tyErr').textContent = '';
    }
  }

  // Ask (first time) or edit
  MC.askUserType = function (edit) {
    firstTime = !edit;
    $('tyCancel').hidden = firstTime;
    $('tyTitle').textContent = edit ? 'Your practice' : 'Welcome 🙏';
    showStep(edit && MC.isInitiated());
    open();
  };
  MC.maybeAskUserType = function () {
    if (MC.account.mode() === 'none' || MC.profile.userType) return;
    if (!$('welcome').hidden || dlg.open) return;
    MC.askUserType(false);
  };

  $('tyYes').addEventListener('click', function () { showStep(true); });
  $('tyNo').addEventListener('click', function () {
    var was = MC.profile.userType;
    MC.profile.userType = 'seeker';
    MC.saveProfile(); MC.emit('profile');
    close();
    if (was !== 'seeker') MC.toast('Welcome, seeker. Your 42-day challenge is in Roadmap. 🌱', 4000);
    MC.go(firstTime ? 'roadmap' : MC.current || 'home');
  });
  $('tyBack').addEventListener('click', function () { showStep(false); });
  $('tyCancel').addEventListener('click', close);
  dlg.addEventListener('cancel', function (e) { if (firstTime) e.preventDefault(); });   // must choose on first launch

  $('tyForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = MC.parseDate($('tyDate').value), by = $('tyBy').value, err = '';
    var dob = MC.parseDate(MC.profile.dob);
    if (!d) err = 'Please enter your initiation date.';
    else if (d > MC.today()) err = 'The date can’t be in the future.';
    else if (d.getFullYear() < 1900) err = 'Please check the year.';
    else if (dob && d < dob) err = 'The date can’t be before your date of birth.';
    else if (MC.MASTERS.indexOf(by) < 0) err = 'Please choose who initiated you.';
    if (err) { $('tyErr').textContent = err; return; }
    var was = MC.profile.userType;
    MC.profile.userType = 'initiated';
    MC.profile.start = $('tyDate').value;          // same as "When did your meditation journey begin?"
    MC.profile.initiatedBy = by;
    MC.saveProfile(); MC.emit('profile');
    close();
    if (was !== 'initiated') MC.toast('Thank you. Your full 10,000-hour Roadmap is ready. 🪷', 4000);
    MC.go(firstTime || was !== 'initiated' ? 'roadmap' : MC.current || 'home');
  });

  // Section for the Account & settings sheet
  MC.profileSheetHTML = function () {
    var p = MC.profile, body;
    if (p.userType === 'initiated') {
      body = '<b>Initiated Member</b><div class="small muted">Initiated ' + (p.start ? MC.esc(MC.fmtDate(MC.parseDate(p.start))) : '') +
        (p.initiatedBy ? ' by ' + MC.esc(p.initiatedBy) : '') + '</div>';
    } else if (p.userType === 'seeker') {
      body = '<b>New Seeker</b><div class="small muted">42-day challenge on the Roadmap</div>';
    } else {
      body = '<b>Not set yet</b>';
    }
    return '<div class="section-title" style="margin-top:20px">Your practice</div>' +
      '<div class="profile-row"><div>' + body + '</div><button class="btn btn-ghost btn-sm" id="acProfile" style="flex:0 0 auto">Change</button></div>';
  };
})();
