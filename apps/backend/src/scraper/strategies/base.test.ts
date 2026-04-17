import test from 'node:test';
import assert from 'node:assert/strict';
import { extractChapterNumber } from './base.js';

test('extractChapterNumber detects common chapter patterns', () => {
  assert.equal(extractChapterNumber('Chapter 10'), 10);
  assert.equal(extractChapterNumber('Capítulo 3.5'), 3.5);
  assert.equal(extractChapterNumber('Ch. 99'), 99);
  assert.equal(extractChapterNumber('#42'), 42);
  assert.equal(extractChapterNumber('Episodio final 12'), 12);
});

test('extractChapterNumber returns null when no chapter-like number exists', () => {
  assert.equal(extractChapterNumber('Sin número de capítulo'), null);
  assert.equal(extractChapterNumber('Welcome page'), null);
});
