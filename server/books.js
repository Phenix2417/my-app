export const BOOKS = [
  ['genesis', 'Genesis', 50], ['exodus', 'Exodus', 40], ['leviticus', 'Leviticus', 27], ['numbers', 'Numbers', 36],
  ['deuteronomy', 'Deuteronomy', 34], ['joshua', 'Joshua', 24], ['judges', 'Judges', 21], ['ruth', 'Ruth', 4],
  ['1samuel', '1 Samuel', 31], ['2samuel', '2 Samuel', 24], ['1kings', '1 Kings', 22], ['2kings', '2 Kings', 25],
  ['1chronicles', '1 Chronicles', 29], ['2chronicles', '2 Chronicles', 36], ['ezra', 'Ezra', 10], ['nehemiah', 'Nehemiah', 13],
  ['esther', 'Esther', 10], ['job', 'Job', 42], ['psalms', 'Psalms', 150], ['proverbs', 'Proverbs', 31],
  ['ecclesiastes', 'Ecclesiastes', 12], ['songofsolomon', 'Song of Solomon', 8], ['isaiah', 'Isaiah', 66], ['jeremiah', 'Jeremiah', 52],
  ['lamentations', 'Lamentations', 5], ['ezekiel', 'Ezekiel', 48], ['daniel', 'Daniel', 12], ['hosea', 'Hosea', 14],
  ['joel', 'Joel', 3], ['amos', 'Amos', 9], ['obadiah', 'Obadiah', 1], ['jonah', 'Jonah', 4], ['micah', 'Micah', 7],
  ['nahum', 'Nahum', 3], ['habakkuk', 'Habakkuk', 3], ['zephaniah', 'Zephaniah', 3], ['haggai', 'Haggai', 2],
  ['zechariah', 'Zechariah', 14], ['malachi', 'Malachi', 4],
  ['matthew', 'Matthew', 28], ['mark', 'Mark', 16], ['luke', 'Luke', 24], ['john', 'John', 21], ['acts', 'Acts', 28],
  ['romans', 'Romans', 16], ['1corinthians', '1 Corinthians', 16], ['2corinthians', '2 Corinthians', 13],
  ['galatians', 'Galatians', 6], ['ephesians', 'Ephesians', 6], ['philippians', 'Philippians', 4], ['colossians', 'Colossians', 4],
  ['1thessalonians', '1 Thessalonians', 5], ['2thessalonians', '2 Thessalonians', 3], ['1timothy', '1 Timothy', 6],
  ['2timothy', '2 Timothy', 4], ['titus', 'Titus', 3], ['philemon', 'Philemon', 1], ['hebrews', 'Hebrews', 13],
  ['james', 'James', 5], ['1peter', '1 Peter', 5], ['2peter', '2 Peter', 3], ['1john', '1 John', 5], ['2john', '2 John', 1],
  ['3john', '3 John', 1], ['jude', 'Jude', 1], ['revelation', 'Revelation', 22],
].map(([id, name, chapters]) => ({ id, name, chapters }));

export const BOOK_IDS = new Set(BOOKS.map((b) => b.id));
