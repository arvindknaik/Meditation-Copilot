/* sosmn.org and admin — event types, audiences and their icons (one place for both sites).
 * Icons are simple line drawings in a coloured tile, so each type is easy to recognise in a list.
 * If an event has a flyer, lists show a small picture of the flyer instead of the icon. */
(function () {
  'use strict';
  var I = {
    intro: { label: 'Public Intro', color: '#0f766e',
      svg: '<path d="M3 18h18"/><path d="M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 5v3M5.2 9.2l2 2M18.8 9.2l-2 2"/>' },
    workshop: { label: 'Workshop', color: '#1d4ed8',
      svg: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.3"/><path d="M15.6 14a4.6 4.6 0 0 1 5.4 5"/>' },
    satsang: { label: 'Satsang', color: '#6d28d9',
      svg: '<path d="M12 19.5c-2.6-1.9-3.6-4.6-3.6-7.6 2 .9 3.2 2.6 3.6 4.6.4-2 1.6-3.7 3.6-4.6 0 3-1 5.7-3.6 7.6z"/><path d="M12 16.5c-1.3-2.8-1.3-6.3 0-9.9 1.3 3.6 1.3 7.1 0 9.9"/><path d="M8.4 18.6c-2.9 0-4.9-1.7-5.9-3.7 1.9-.1 3.9.4 5.6 1.8M15.6 18.6c2.9 0 4.9-1.7 5.9-3.7-1.9-.1-3.9.4-5.6 1.8"/>' },
    retreat: { label: 'Retreat', color: '#15803d',
      svg: '<path d="M2.5 19.5l6.5-10 4 6 2.8-3.8 5.7 7.8z"/><circle cx="17" cy="6.5" r="2"/>' },
    darshan: { label: 'Darshan', color: '#b45309',
      svg: '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>' },
    festival: { label: 'Festival', color: '#c2410c',
      svg: '<path d="M3.5 14h17c0 3-3.8 5.5-8.5 5.5S3.5 17 3.5 14z"/><path d="M12 3.5c1.6 2.1 2.2 3.4 2.2 4.5a2.2 2.2 0 0 1-4.4 0c0-1.1.6-2.4 2.2-4.5z"/><path d="M12 10.5V14"/>' },
    celebration: { label: 'Celebration', color: '#be185d',
      svg: '<path d="M4 20l4.2-11.3 7.1 7.1z"/><path d="M13.5 4.5l.8 1.8M19.5 7.3l-1.9.7M18.5 12.5h2M10.8 3v2M16.8 3.2l-1 1.7"/>' }
  };
  var ORDER = ['intro', 'workshop', 'satsang', 'retreat', 'darshan', 'festival', 'celebration'];
  var AUDIENCE = { 'public': 'Public', satsang: 'Community', initiates: 'Initiates' };
  function type(k) { return I[k] || I.workshop; }
  // A coloured tile with the type's icon; size in px (default 44)
  function icon(kind, size) {
    var t = type(kind), s = size || 44;
    return '<span class="type-ico" style="--tc:' + t.color + ';width:' + s + 'px;height:' + s + 'px" title="' + t.label + '" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="' + Math.round(s * 0.58) + '" height="' + Math.round(s * 0.58) + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + t.svg + '</svg></span>';
  }
  // The flyer's small picture if there is one, otherwise the type icon
  function thumb(e, flyerThumbUrl, size) {
    var s = size || 44;
    return flyerThumbUrl ? '<img class="type-ico flyer-thumb" src="' + flyerThumbUrl + '" alt="" loading="lazy" width="' + s + '" height="' + s + '" style="width:' + s + 'px;height:' + s + 'px">' : icon(e.kind, s);
  }
  window.SOS_TYPES = { order: ORDER, label: function (k) { return type(k).label; }, color: function (k) { return type(k).color; }, icon: icon, thumb: thumb, AUDIENCE: AUDIENCE };
})();
