// Interface language: English or Chinese (简体中文). The app is written in English; in Chinese, text put on screen
// is looked up here. Exact strings first, then templates where {0}, {1}… stand for the parts that change
// ("Added “{0}”" -> "已添加“{0}”"). Anything not listed stays as it is (Bible text, notes, book titles…).
const KEY = 'bs.lang';
export let LANG = (() => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v === 'zh' || v === 'en') return v; } catch { /* none saved */ }
  return /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
})();
export function setLang(lang) {
  LANG = lang === 'zh' ? 'zh' : 'en';
  try { localStorage.setItem(KEY, JSON.stringify(LANG)); } catch { /* blocked */ }
  document.documentElement.lang = LANG === 'zh' ? 'zh-Hans' : 'en';
}
document.documentElement.lang = LANG === 'zh' ? 'zh-Hans' : 'en';

const ZH = {
  // Tabs and page titles
  Main: '主菜单', Read: '读经', Notes: '笔记', Shelf: '书架', Friends: '朋友', Account: '账户', Commentary: '注释', Dictionary: '词典',
  Books: '书卷', Contents: '目录', Book: '书', 'Bible versions': '圣经译本', 'Bible version': '圣经译本', 'Text size': '字号',
  'More options': '更多选项', 'Language': '语言', '中文 / English': '中文 / English',
  // Common buttons
  Delete: '删除', Cancel: '取消', Confirm: '确定', Save: '保存', Done: '完成', Add: '添加', Remove: '移除', Copy: '复制', Copied: '已复制',
  "Couldn't copy": '无法复制', Note: '笔记', 'Edit note': '编辑笔记', Highlighted: '已标记', More: '更多', Less: '收起', Refresh: '刷新',
  Accept: '接受', Decline: '拒绝', Mine: '我的', 'Back to top': '回到顶部', 'Selection actions': '选中文字操作', 'Highlight color': '标记颜色',
  Dialog: '对话框', 'Sign out': '退出登录', 'Sign in': '登录', 'Create account': '注册账户', Name: '名称', 'Short name': '简称', Title: '书名',
  Grammar: '语法', 'Add more': '添加更多', 'Add version': '添加译本', 'The end': '完', '‹ Previous': '‹ 上一章', 'Next ›': '下一章 ›',
  English: '英文', 'Bible Study': '圣经学习', UK: '英', US: '美', "Friends'": '朋友的',
  'Show the Chinese Bible dictionary entry': '显示圣经辞典条目', 'Show the Chinese Bible wiki article': '显示圣经wiki条目', yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色', purple: '紫色', British: '英式', American: '美式', Someone: '某人',
  // Notes
  'Delete this note?': '删除这条笔记？', 'Delete this highlight?': '删除这个标记？', 'Note deleted': '笔记已删除', 'Highlight deleted': '标记已删除',
  'Write a note (optional)': '写笔记（可选）', 'Your note': '我的笔记', 'Quoted from commentary': '引自注释', 'Notes here': '这里的笔记',
  'Notes on this passage': '这段经文的笔记', 'Whose notes': '谁的笔记', 'My notes': '我的笔记', "Friends' notes": '朋友的笔记',
  "Couldn't refresh. Showing saved notes.": '无法刷新，显示已保存的笔记。',
  'No notes yet. In Read, hold a word to start a highlight.': '还没有笔记。在“读经”里按住一个词开始标记。',
  'Nothing here yet. Friends\' notes appear once they turn on “Can see my notes” for you.': '这里还没有内容。朋友为你打开“可以看我的笔记”后，他们的笔记会显示在这里。',
  "Couldn't load commentaries. Check your connection.": '无法载入注释，请检查网络连接。',
  "Couldn't find where this was quoted.": '找不到引用的位置。',
  // Read
  'This is the last chapter of the Bible.': '这是圣经的最后一章。', 'This is the first chapter of the Bible.': '这是圣经的第一章。',
  'Tip: hold a word or tap a verse number to select. Swipe sideways to change chapter.': '提示：按住一个词或点经节号来选择文字，左右滑动换章。',
  "Couldn't load this chapter. Check your connection and try again.": '无法载入这一章，请检查网络连接后再试。',
  "Couldn't load this chapter.": '无法载入这一章。', 'Selection start': '选择起点', 'Selection end': '选择终点',
  'Dictionary counts': '词典数量标记', Translate: '翻译', Original: '原文', 'Try again': '重试', 'Open as ebook': '作为电子书打开', 'Open as Bible': '作为圣经打开', 'Import as a Bible': '作为圣经导入', 'Change cover': '更换封面', 'Pictures in the book': '书中的图片', 'Pages of the book': '书的页面', 'A photo from your phone': '手机里的照片', 'No pictures in this book.': '这本书里没有图片。', 'No pages to use.': '没有可用的页面。', Page: '页', 'Cover changed': '封面已更换', "That picture couldn't be used.": '这张图片无法使用。', Messages: '消息', Chat: '聊天', 'Search friends or groups': '搜索好友或群组', All: '全部', Private: '私聊', Groups: '群聊', Group: '群',
  'New chat': '新建聊天', 'New group chat': '新建群聊', Shared: '分享了', 'Shared verse': '分享经文', 'This message was deleted': '此消息已删除', Edited: '已编辑', Edit: '编辑', 'Edit message': '编辑消息',
  'Delete this message?': '删除这条消息？', 'Everyone in the chat will see “This message was deleted”.': '聊天中的每个人都会看到“此消息已删除”。', Message: '消息', 'That message was deleted': '这条消息已被删除', 'Message not found': '找不到这条消息', 'Add a comment (optional)': '添加留言（可选）', 'Shared note': '分享笔记', 'Shared a note': '分享了笔记', 'Open in Read →': '在读经中打开 →',
  'Share to chat': '分享到聊天', 'Share a verse': '分享经文', 'Say something…': '说点什么…', 'Back to Chat': '返回聊天', members: '位成员',
  'Group name': '群名称', 'Add members': '添加成员', Create: '创建', Members: '成员', 'Rename group': '修改群名称', 'Leave group': '退出群聊', Leave: '退出',
  'Remove friend': '移除好友', 'Go to Read': '去读经', 'Select the verses to share': '请选中要分享的经文', 'Nothing found.': '没有找到。',
  'No chats yet. Tap + to add a friend or start a group chat.': '还没有聊天。点 + 添加好友或新建群聊。', 'Add friends first, then start a group with them.': '请先添加好友，再和他们建群。',
  'All your friends are already in this group.': '你的好友都已经在这个群里了。', 'No chats yet. Add a friend in Chat first.': '还没有聊天，请先在“聊天”里添加好友。',
  "Couldn't refresh. Showing your saved chats.": '无法刷新，显示已保存的聊天。', "Couldn't load chats. Check your connection.": '无法载入聊天，请检查网络连接。',
  'In Read, select the verses, then tap Share to chat in the bubble: they come back to this chat.': '在读经里选中经文，然后点气泡里的“分享到聊天”，经文就会发到这个聊天里。',
  "You won't see this group's messages any more.": '你将不再看到这个群的消息。', 'Please give the group a name': '请给群起个名字', 'Group not found': '找不到这个群', 'Invalid verse': '经文无效', Bible: '圣经', Send: '发送', 'Write a message': '写消息', 'No messages yet.': '还没有消息。', 'Loading…': '载入中…',
  'Write a message first': '请先写消息', 'Year published': '出版年份', 'Putting it on your shelf…': '正在放到书架上…', Repair: '补全', 'Your Bibles': '我的圣经', 'Add a Bible from an EPUB you own': '从你拥有的 EPUB 添加圣经', 'Add a Bible': '添加圣经',
  'Old Testament': '旧约', 'New Testament': '新约', 'Add the Chinese translation': '添加中文译本', 'Add the English translation': '添加英文译本',
  'Keep the app open until saving finishes.': '保存完成前请不要关闭应用。', 'Choose a book': '选择书卷', 'Choose book and chapter': '选择书卷和章',
  'Read these verses': '阅读这几节经文', 'Back to where you started': '回到开始的位置', 'Back up to where you started': '向上回到开始的位置',
  'Back down to where you started': '向下回到开始的位置', 'Smaller text': '缩小字号', 'Larger text': '放大字号', 'Reading text size': '阅读字号',
  // Dictionary panel
  'Translating…': '翻译中…', 'Tap a word for its definition': '点一个词查看释义', 'Analysing…': '分析中…', 'Looking up…': '查询中…',
  'Translation needs a connection.': '翻译需要网络连接。', "Couldn't load the dictionary. Check your connection.": '无法载入词典，请检查网络连接。',
  'Not in the English dictionary.': '英文词典中没有这个词。', 'Pronunciation needs a connection.': '发音需要网络连接。',
  'Tap any word above for its definition, or Grammar to analyse the passage.': '点上面任意一个词查看释义，或点“语法”分析这段经文。',
  'The Bible dictionary needs a connection.': '圣经辞典需要网络连接。', '‹ Back to commentary': '‹ 返回注释',
  "Couldn't load the grammar tool. Check your connection and try again.": '无法载入语法工具，请检查网络连接后再试。',
  'Tap a part to see what it does. Automatic analysis (compromise) · may be wrong for unusual word order': '点一个部分查看它的作用。自动分析（compromise）· 语序特殊时可能不准',
  "couldn't check right now": '暂时无法检查', 'ECDICT (offline dictionary)': 'ECDICT（离线词典）', Youdao: '有道',
  'Translation: Youdao · Chinese: ECDICT, Wiktionary (CC BY-SA) · English: ECDICT, Free Dictionary (Wiktionary), WordNet · Phonetics & audio: Youdao, Free Dictionary API · 圣经辞典: 信望爱 · Easton (1897), ISBE (1915): public domain, via CrossWire · 圣经wiki / Bible Wiki: Wikipedia (CC BY-SA)':
    '翻译：有道 · 中文：ECDICT、Wiktionary（CC BY-SA）· 英文：ECDICT、Free Dictionary（Wiktionary）、WordNet · 音标和发音：有道、Free Dictionary API · 圣经辞典：信望爱 · 圣经wiki：维基百科（CC BY-SA）',
  'Chinese: ECDICT, Wiktionary (CC BY-SA) · English: ECDICT, Free Dictionary (Wiktionary), WordNet · Phonetics & audio: Youdao, Free Dictionary API · 圣经辞典: 信望爱 · Easton (1897), ISBE (1915): public domain, via CrossWire · 圣经wiki / Bible Wiki: Wikipedia (CC BY-SA)':
    '中文：ECDICT、Wiktionary（CC BY-SA）· 英文：ECDICT、Free Dictionary（Wiktionary）、WordNet · 音标和发音：有道、Free Dictionary API · 圣经辞典：信望爱 · 圣经wiki：维基百科（CC BY-SA）',
  // Commentary
  'Commentary text': '注释正文', 'Edit commentary list': '编辑注释列表', 'Your commentaries, in order': '我的注释（按顺序）', 'Edit your list': '编辑列表',
  'The first one opens by default. Press and hold a commentary, then drag it to change the order.': '默认打开第一本。按住一本注释拖动可以调整顺序。',
  'Your list is empty. Add commentaries below.': '列表是空的，请在下面添加注释。',
  'Your commentary list is empty. Open the side bar and tap the pencil to add some.': '注释列表是空的，请点 ⋯ 里的编辑按钮添加。',
  "You're offline. Commentary needs a connection the first time you open a chapter.": '你已离线。第一次打开某一章的注释需要网络连接。',
  'That was the last commentary in your list.': '这是列表中的最后一本注释。', 'That was the first commentary in your list.': '这是列表中的第一本注释。',
  'Note on the Bible text, linking to this quote': '在经文上记笔记，并链接到这段引文',
  "You're offline. Your list is saved on this phone and will sync when you reorder again online.": '你已离线。列表已保存在这台手机上，联网后再次调整顺序时会同步。',
  // Versions
  'Tap a second version to read two side by side.': '再点一个译本，可以两个译本对照阅读。',
  'Highlights and notes stay with the version they were made in. A Bible you add is kept privately in your account; friends can\'t read it.': '标记和笔记跟随做标记时的译本。你添加的圣经只保存在你的账户里，朋友看不到。',
  'Choose the EPUB of a Bible you own. The app reads its books, chapters and verses and shows you what it found before adding it.': '选择你拥有的圣经 EPUB。应用会读取其中的书卷、章和节，添加前先给你看读取结果。',
  'From your phone or cloud': '从手机或云盘', 'From your shelf': '从书架', 'Loading your shelf…': '正在载入书架…', 'Choose from your shelf': '从书架选择', 'Choose from shelf': '从书架选择',
  'There are no EPUB books on your shelf yet. Add the Bible from your phone or cloud instead; it will also be put on your shelf.': '书架上还没有 EPUB 书。请从手机或云盘添加圣经，它也会放到书架上。',
  'Reading your Bible…': '正在读取圣经…', 'Checking chapters and verses…': '正在检查章节…', 'No Bible verses were found in this EPUB.': '这个 EPUB 里没有找到经文。',
  "This ebook's layout wasn't fully understood, so some verses may be in the wrong place. Check the samples below.": '这本电子书的排版没能完全识别，有些经文可能位置不对。请检查下面的示例。',
  'This Bible has two translations side by side. Each can be added as its own version.': '这本圣经有两个译本对照，每个都可以作为单独的译本添加。',
  'Choose at least one translation to add.': '请至少选择一个译本。', 'My Bible': '我的圣经',
  // Friends and account
  'Add a friend': '添加朋友', 'Friend requests': '好友请求', 'Sent requests': '已发送的请求', 'Can see my notes': '可以看我的笔记',
  'No friends yet. Tap Add and enter a username.': '还没有朋友。点“添加”并输入用户名。', 'You are now friends': '你们已成为朋友', 'Request sent': '请求已发送',
  "You're offline.": '你已离线。', "You're offline. Try again when connected.": '你已离线，联网后再试。', 'Their username': '对方的用户名', 'Send request': '发送请求',
  "Couldn't refresh. Showing your saved friends list.": '无法刷新，显示已保存的朋友列表。', "Couldn't load friends. Check your connection.": '无法载入朋友列表，请检查网络连接。',
  'Display name saved': '显示名称已保存', 'Display name (any language)': '显示名称（任何语言）', 'Scripture: World English Bible (public domain).': '经文：World English Bible（公有领域）。',
  'e.g. 小明, José, Anna': '例如：小明、José、Anna', 'Highlight, take notes, and read alongside your friends.': '标记、记笔记，和朋友一起读经。',
  "Can't reach the server. Check your connection.": '无法连接服务器，请检查网络连接。', 'Display name (any language, optional)': '显示名称（任何语言，可选）',
  'Username (letters, numbers, _ — friends add you with this)': '用户名（字母、数字、_，朋友用它添加你）', Username: '用户名', Password: '密码',
  'Password (8+ characters)': '密码（至少 8 个字符）', 'New here? Create an account': '第一次使用？注册账户', 'Have an account? Sign in': '已有账户？登录',
  'Please sign in again': '请重新登录', 'You seem to be offline.': '你好像离线了。', 'Signed out': '已退出登录',
  // Shelf and books
  'Add a book': '添加书', 'Book options': '书的选项', 'Delete this book?': '删除这本书？', 'Book deleted': '书已删除', 'Opening…': '正在打开…',
  "Couldn't refresh your shelf. Showing the saved list.": '无法刷新书架，显示已保存的列表。',
  'Add EPUB, PDF or text books from your phone, Google Drive or Dropbox. They’re kept in your account, so they open on any device you sign in on.': '从手机、Google Drive 或 Dropbox 添加 EPUB、PDF 或文本书。书保存在你的账户里，在任何登录的设备上都能打开。',
  "You're offline. Try again when you're connected.": '你已离线，联网后再试。', "You're offline. Books on your shelf need a connection to open.": '你已离线。打开书架上的书需要网络连接。',
  'Back to shelf': '返回书架', 'Back to the book': '返回书中', 'This is the end of the book.': '已经是书的结尾。', 'This is the beginning of the book.': '已经是书的开头。',
  'No highlights or notes in this book yet. Hold a word to select text, then pick a colour or Note.': '这本书还没有标记或笔记。按住一个词选择文字，然后选颜色或“笔记”。',
  "You're offline: this note wasn't saved.": '你已离线：这条笔记没有保存。', "Couldn't delete the note. Try again when you're connected.": '无法删除笔记，联网后再试。',
  // Server messages
  'Book not found': '找不到这本书', 'Invalid book data': '书卷数据无效', 'Note is too long': '笔记太长', 'Note not found': '找不到这条笔记',
  'No one has that username': '没有这个用户名', 'No request to accept': '没有可接受的请求', 'No wiki article for this word': '这个词没有维基条目',
  'Not found': '找不到', 'Not in the Bible dictionary': '圣经辞典中没有这个词', 'Only EPUB, PDF and text files can be added.': '只能添加 EPUB、PDF 和文本文件。',
  'Password must be at least 8 characters': '密码至少 8 个字符', 'Please enter a title': '请输入书名', 'Please give the version a name and a short name.': '请给译本一个名称和简称。',
  'That book is too large.': '这本书太大了。', 'That file is too large.': '这个文件太大了。', 'That username is taken': '这个用户名已被使用', "That's you!": '这是你自己！',
  'The cover must be a JPEG or PNG image.': '封面必须是 JPEG 或 PNG 图片。', 'The upload was interrupted.': '上传中断了。',
  'This link has expired. Open the book again from your library.': '链接已过期，请从书架重新打开这本书。', 'This version has no text for this chapter.': '这个译本没有这一章。',
  'Too many attempts. Try again in a few minutes.': '尝试次数太多，请过几分钟再试。', 'Unknown Bible version': '未知的圣经译本', 'User not found': '找不到这个用户',
  'Username must be 3–20 letters, numbers or _': '用户名必须是 3–20 个字母、数字或 _', 'Version not found': '找不到这个译本', 'Wrong username or password': '用户名或密码错误',
  'You are not friends with this person': '你们还不是朋友', 'You can add up to 5 Bibles of your own.': '最多可以添加 5 本自己的圣经。',
  'Your library is full. Delete a book to make room.': '书架已满，请删除一本书腾出空间。', "Couldn't reach Wikipedia. Try again in a moment.": '无法连接维基百科，请稍后再试。',
  "Couldn't reach the Bible dictionary.": '无法连接圣经辞典。', "Couldn't reach the Bible text service.": '无法连接经文服务。',
  "Couldn't reach the commentary service. Try again in a moment.": '无法连接注释服务，请稍后再试。', "Couldn't reach the dictionary service.": '无法连接词典服务。',
  "Couldn't reach the translation service. Try again in a moment.": '无法连接翻译服务，请稍后再试。', 'No translation for this selection.': '这段文字没有翻译结果。',
  'That selection is too long to translate. Try a shorter part.': '选中的文字太长，无法翻译，请选短一些。', 'Request too large': '请求太大',
};

// Templates: {0}, {1}… are the parts that change.
const ZH_TEMPLATES = [
  ['Edited today, {0}', '今天 {0} 编辑'], ['Today, {0}', '今天 {0}'], ['Edited {0}', '{0} 编辑'],
  ['Open in {0}', '在{0}中打开'], ['{0}. Choose a book', '{0}。选择书卷'], ['Chapter {0}. Choose a chapter', '第 {0} 章。选择章'],
  ['{0}. Choose a Bible version', '{0}。选择圣经译本'], ['{0} needs a connection the first time you open a chapter.', '第一次打开{0}的某一章需要网络连接。'],
  ['Note from {0}', '{0} 的笔记'], ['Highlight {0} in the Bible text, with this quote', '在经文上标记{0}，附上这段引文'], ['Highlight {0}', '标记{0}'],
  ['From “{0}”', '出自“{0}”'], ['No {0} recording for “{1}”.', '“{1}”没有{0}录音。'], ['Recording from {0}', '录音来自{0}'], ['Phonetic from {0}', '音标来自{0}'],
  ['Play {0} pronunciation of {1}', '播放 {1} 的{0}发音'], ['Look up {0}', '查 {0}'], ['‹ Back to {0} {1}', '‹ 返回{0} {1}'], ['Base form: {0}', '原形：{0}'],
  ['{0} doesn\'t cover {1}. Pick another commentary above.', '{0}没有涵盖{1}，请在上面选择别的注释。'], ['{0} doesn\'t cover {1}', '{0}没有涵盖{1}'],
  ['{0}, position {1} of {2}. Press and hold to drag, or use the arrow keys.', '{0}，第 {1} 个，共 {2} 个。按住拖动，或使用方向键。'], ['Remove {0}', '移除{0}'],
  ['Loading {0}…', '正在载入{0}…'], ['{0} has no comments on this chapter.', '{0}对这一章没有注释。'], ['Introduction to {0} {1}', '{0} {1} 导论'],
  ['Verses {0}–{1}', '第 {0}–{1} 节'], ['Verse {0}', '第 {0} 节'], ['No comment on verse {0} in {1}. Showing the whole chapter.', '{1}对第 {0} 节没有注释，显示整章。'],
  ['‹ swipe › · {0} of {1}', '‹ 左右滑动 › · {0}/{1}'], ['Added to your note on {0}', '已添加到你在{0}的笔记'],
  ['{0} with {1} under each verse. Highlights and notes go on {2}.', '{0}，每节下面是{1}。标记和笔记记在{2}上。'], ['Delete {0}?', '删除{0}？'], ['Delete {0}', '删除{0}'],
  ['{0}, and the highlights and notes you made in it, will be removed from your account.', '{0}以及你在其中做的标记和笔记会从你的账户中删除。'], ['{0} deleted', '{0}已删除'],
  ['Use {0}', '使用{0}'], ['This file couldn\'t be read as an EPUB ({0}).', '这个文件无法作为 EPUB 读取（{0}）。'],
  ['Found {0} of 66 books, {1} chapters and {2} verses. {3}% of chapters match the usual verse numbering.', '找到 66 卷中的 {0} 卷，{1} 章，{2} 节。{3}% 的章与通常的节号一致。'],
  ['Missing: {0}', '缺少：{0}'], ['Saving {0} {1} / {2}…', '正在保存 {0} {1} / {2}…'], ['You and {0} are friends', '你和{0}是朋友'],
  ['Remove {0} as a friend?', '把{0}从朋友中移除？'], ['@{0} · You\'ll stop seeing each other\'s notes.', '@{0} · 你们将互相看不到笔记。'],
  ['{0} can read all your notes', '{0}可以看你所有的笔记'], ['Your notes are hidden from {0}', '你的笔记对{0}隐藏'], ['You can see {0}\'s notes', '你可以看{0}的笔记'],
  ['{0} hasn\'t shared notes with you yet', '{0}还没有和你分享笔记'], ['Your username is @{0}. Friends use it to add you; it can\'t be changed.', '你的用户名是 @{0}。朋友用它添加你，不能更改。'],
  ['Request failed ({0})', '请求失败（{0}）'], ["“{0}” isn't in the Bible reader yet. Import it as a Bible? The app reads its books, chapters and verses and shows you what it found first.", '“{0}”还没有导入圣经阅读器。要把它作为圣经导入吗？应用会读取其中的书卷、章和节，先给你看读取结果。'], ['Share {0}', '分享{0}'], ['Sent to {0}', '已发送给{0}'], ['Leave {0}?', '退出{0}？'],
  ['@{0} · wants to be friends', '@{0} · 想加你为好友'], ['Remove {0} as a friend?', '把{0}从好友中移除？'], ['Messages with {0}', '与{0}的消息'], ["{0}'s note is in {1}", '{0}的笔记用的是 {1}'],
  ["You don't have {0}. Read {1} in {2}, or ask {3} about {4} — for example where to get the same ebook.", '你没有 {0}。可以用 {2} 读{1}，或者问问{3}这本 {4} 的情况，比如从哪里得到同样的电子书。'],
  ['Read {0} in {1}', '用 {1} 读{0}'], ['Ask {0} about {1}', '问{0}关于 {1}'], ['{0} is missing {1} of 66 books.', '{0}缺少 {1} 卷书（共 66 卷）。'], ['Repair {0}', '补全{0}'],
  ['{0} repaired', '{0}已补全'], ["This EPUB doesn't have the books {0} is missing.", '这个 EPUB 里没有{0}缺少的书卷。'], ['Choose the EPUB {0} came from. Its books are saved again into {1}; your highlights and notes in it stay.', '请选择{0}原来的 EPUB。书卷会重新保存到{1}里，你在其中的标记和笔记都会保留。'],
  ["{0} doesn't have this chapter — its import may not have finished. Repair it from the EPUB it came from.", '{0}没有这一章，可能当初没有导入完成。请用原来的 EPUB 补全。'], ['{0}: the server isn\'t answering right now ({1}). Try again in a moment.', '{0}：服务器暂时没有响应（{1}），请稍后重试。'],
 ['Open {0}', '打开{0}'], ['Book options: {0}', '书的选项：{0}'],
  ['{0}: only EPUB, PDF and text files can be added.', '{0}：只能添加 EPUB、PDF 和文本文件。'], ['{0} is larger than 60 MB.', '{0}超过 60 MB。'],
  ['{0} couldn\'t be read. Try choosing it again.', '{0}无法读取，请重新选择。'], ['{0} couldn\'t be opened as an EPUB book ({1}).', '{0}无法作为 EPUB 书打开（{1}）。'],
  ['“{0}” is already on your shelf', '“{0}”已经在书架上'], ['Adding “{0}”…', '正在添加“{0}”…'], ['Added “{0}”', '已添加“{0}”'],
  ['“{0}” and its highlights and notes will be removed from your shelf.', '“{0}”以及其中的标记和笔记会从书架上删除。'],
  ['This book couldn\'t be opened ({0}).', '这本书无法打开（{0}）。'], ['Chapter {0} of {1}', '第 {0} 章，共 {1} 章'], ['Chapter {0}', '第 {0} 章'],
  ['Section {0}', '第 {0} 部分'], ["Couldn't save the note: {0}", '无法保存笔记：{0}'],
  ['Display name can be at most {0} characters', '显示名称最多 {0} 个字符'], ['{0} · {1} MB', '{0} · {1} MB'],
];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compiled = ZH_TEMPLATES.map(([en, zh]) => {
  const order = [];
  const source = en.split(/(\{\d\})/).map((part) => {
    const m = part.match(/^\{(\d)\}$/);
    if (m) { order.push(+m[1]); return '([\\s\\S]+?)'; }
    return escape(part);
  }).join('');
  return { re: new RegExp(`^${source}$`), order, zh };
});

// Translate a piece of interface text (unchanged in English, or when it isn't listed).
export function t(s) {
  if (LANG !== 'zh' || typeof s !== 'string' || !s) return s;
  const exact = ZH[s];
  if (exact != null) return exact;
  if (s.length > 400 || !/[A-Za-z]/.test(s)) return s;
  for (const { re, order, zh } of compiled) {
    const m = s.match(re);
    if (m) return zh.replace(/\{(\d)\}/g, (x, n) => m[order.indexOf(+n) + 1] ?? '');
  }
  return s;
}

// Elements whose text is content (Bible words, notes, dictionary entries, book and people's names…): never translated.
export const CONTENT_CLASS = /(^|\s)(w|g|vnum|tw|quote|note-body|note-title|bd-text|bd-term|bd-en|dict-word|dict-en|dict-zh|dict-sense|dict-ex|trans-en|trans-zh|lib-title|lib-meta|lib-tile-title|lib-tile-author|toc-title|toc-item|b-running|person-name|dname|who|version-name|manage-name|commentary-text|c-entry|bible-sample|g-text|g-sentence|ipa|xref|vref|lang-switch)(\s|$)/;

// Bible book names in Chinese (和合本), in Bible order.
export const ZH_BOOKS = '创世记 出埃及记 利未记 民数记 申命记 约书亚记 士师记 路得记 撒母耳记上 撒母耳记下 列王纪上 列王纪下 历代志上 历代志下 以斯拉记 尼希米记 以斯帖记 约伯记 诗篇 箴言 传道书 雅歌 以赛亚书 耶利米书 耶利米哀歌 以西结书 但以理书 何西阿书 约珥书 阿摩司书 俄巴底亚书 约拿书 弥迦书 那鸿书 哈巴谷书 西番雅书 哈该书 撒迦利亚书 玛拉基书 马太福音 马可福音 路加福音 约翰福音 使徒行传 罗马书 哥林多前书 哥林多后书 加拉太书 以弗所书 腓立比书 歌罗西书 帖撒罗尼迦前书 帖撒罗尼迦后书 提摩太前书 提摩太后书 提多书 腓利门书 希伯来书 雅各书 彼得前书 彼得后书 约翰一书 约翰二书 约翰三书 犹大书 启示录'.split(' ');
