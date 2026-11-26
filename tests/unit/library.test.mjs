// [library] server rules for the center's reading and watching list (no database, no network)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLibrary, checkApproval, libraryOut, bookRef, fromGoogleBooks, fromOpenLibrary } from '../../api/src/index.js';

test('[library] book links, ISBNs and titles are recognised', () => {
  assert.deepEqual(bookRef('https://www.amazon.com/Empowering-Your-Soul-through-Meditation/dp/0918224454/ref=sr_1_1'),
    { isbn: '0918224454', title: 'Empowering Your Soul through Meditation' });
  assert.equal(bookRef('978-0-918224-45-6').isbn, '');                     // bad check digit → not an ISBN
  assert.equal(bookRef('9780306406157').isbn, '9780306406157');             // valid ISBN-13
  assert.equal(bookRef('https://www.amazon.com/dp/B0ABCDEFGH').isbn, '');    // Kindle ASIN, not an ISBN
  assert.equal(bookRef('Meditation as Medicine').title, 'Meditation as Medicine');
});

test('[library] look-up results are turned into book details', () => {
  const g = fromGoogleBooks({ items: [{ volumeInfo: { title: 'Inner and Outer Peace', subtitle: 'through Meditation', authors: ['Rajinder Singh'], pageCount: 180,
    industryIdentifiers: [{ type: 'ISBN_10', identifier: '1852307897' }, { type: 'ISBN_13', identifier: '9781852307899' }], imageLinks: { thumbnail: 'http://books.google.com/x?id=1&edge=curl' } } }] });
  assert.equal(g.title, 'Inner and Outer Peace: through Meditation'); assert.equal(g.isbn, '9781852307899');
  assert.match(g.image, /^https:\/\//); assert.doesNotMatch(g.image, /edge=curl/);
  assert.equal(fromGoogleBooks({ totalItems: 0 }), null);
  const o = fromOpenLibrary({ docs: [{ title: 'Detox the Mind', author_name: ['Rajinder Singh'], isbn: ['1234567890', '9781234567897'], cover_i: 42 }] });
  assert.equal(o.isbn, '9781234567897'); assert.equal(o.image, 'https://covers.openlibrary.org/b/id/42-M.jpg');
});

test('[library] items are checked before they are saved or approved', () => {
  assert.throws(() => validateLibrary({ kind: 'podcast', title: 'X' }));
  assert.throws(() => validateLibrary({ kind: 'video', title: 'X', url: 'http://example.com' }), /https/);
  assert.equal(validateLibrary({ kind: 'video', title: 'Talk', url: 'https://youtu.be/dQw4w9WgXcQ' }).url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.throws(() => checkApproval({ kind: 'book', status: 'approved', chapters: 0 }), /chapters/);
  assert.throws(() => checkApproval({ kind: 'article', status: 'approved', url: '' }), /link/);
  assert.doesNotThrow(() => checkApproval({ kind: 'book', status: 'approved', chapters: 12 }));
  assert.equal(libraryOut({ id: 'a', kind: 'book', title: 'T', status: 'draft' }).status, undefined, 'status only shown to admins');
});
