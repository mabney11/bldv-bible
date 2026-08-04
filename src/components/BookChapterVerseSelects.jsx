import { BOOK_NAMES } from '../lib/books.js';

/**
 * BookChapterVerseSelects — three controlled <select>s for book/chapter/verse.
 *
 * Props:
 *   books:     array of { book_id, first_chapter, last_chapter } from /api/books
 *   book:      current book id
 *   chapter:   current chapter
 *   verse:     current verse (null when in chapter mode)
 *   verses:    array of verse numbers present in current chapter
 *   onBook(id) onChapter(n) onVerse(n|'')
 */
export default function BookChapterVerseSelects({
  books, book, chapter, verse, verses,
  onBook, onChapter, onVerse,
}) {
  const meta = books?.find(b => b.book_id === book);
  const chapters = meta
    ? Array.from({ length: meta.last_chapter - meta.first_chapter + 1 },
                 (_, i) => meta.first_chapter + i)
    : [];

  return (
    <div className="nav-group">
      <div className="nav-sel-wrap">
        <select
          aria-label="Book"
          value={book || ''}
          onChange={e => onBook?.(parseInt(e.target.value, 10))}
        >
          {books?.map(b => (
            <option key={b.book_id} value={b.book_id}>
              {b.seq ?? b.book_id}. {b.label || BOOK_NAMES[b.book_id] || b.name || 'Book ' + b.book_id}
            </option>
          ))}
        </select>
      </div>
      <div className="nav-sel-wrap">
        <select
          aria-label="Chapter"
          value={chapter || ''}
          onChange={e => onChapter?.(parseInt(e.target.value, 10))}
        >
          {chapters.map(c => (
            <option key={c} value={c}>Chapter {c}</option>
          ))}
        </select>
      </div>
      <div className="nav-sel-wrap">
        <select
          aria-label="Verse"
          value={verse || ''}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            onVerse?.(Number.isFinite(v) ? v : null);
          }}
        >
          <option value="">— verse —</option>
          {verses?.map(v => (
            <option key={v} value={v}>Verse {v}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
