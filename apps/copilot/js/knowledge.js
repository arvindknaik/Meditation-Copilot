/* Meditation Copilot — Knowledge content for the Learn tab
 *
 * STATUS: DRAFT FOR SOS REVIEW. The general meditation articles below were drafted for this
 * prototype and have not been reviewed or approved by Science of Spirituality.
 * Topics about the Masters and the teachings are intentionally link-only: add approved text
 * to `body` (one string per paragraph) when it is available, and remove `pending: true`.
 *
 * Fields:
 *   id        unique, used in the link (#learn?a=id)
 *   title     shown on cards and results
 *   icon      one emoji
 *   category  small label above the title
 *   summary   one or two sentences, shown on cards and searched
 *   body      array of paragraphs; a paragraph starting with "- " lines becomes a bullet list
 *   keywords  extra words people might search for
 *   links     [{ label, url }] — official pages on sos.org
 *   pending   true = no approved text yet; the article shows the summary and the links only
 */
window.MC_KNOWLEDGE = {
  featured: ['learn-to-meditate', 'improve-meditation', 'benefits', 'know-the-masters', 'spiritual-goals', 'spiritual-teachings'],
  articles: [
    {
      id: 'learn-to-meditate', icon: '🧘', category: 'Getting started', title: 'Learn to Meditate',
      summary: 'How to begin a simple daily sitting, and where to get free meditation instruction from Science of Spirituality.',
      keywords: 'begin beginner start how to meditate instruction first time posture sit',
      body: [
        'Meditation is the practice of turning our attention inward and letting the mind become still. You do not need special equipment or experience; you need a little time, a quiet place, and a sincere wish to begin.',
        '- Choose a regular time when you are least likely to be disturbed, such as early morning.\n- Sit in any position that is comfortable for you: on a chair, a cushion, or the floor.\n- Keep the body relaxed and still, and gently close your eyes.\n- Let your attention rest inward. When thoughts come, do not fight them; simply and gently return your attention.\n- Start with a length you can keep up every day, then let it grow naturally.',
        'The best way to learn is with proper guidance. Science of Spirituality offers free meditation instruction online and at its centers, including the Learn to Meditate series.'
      ],
      links: [
        { label: 'Learn Meditation on sos.org', url: 'https://sos.org/meditation/learn-meditation/' },
        { label: 'Learn to Meditate online series', url: 'https://sos.org/webinars/learn-to-meditate-series/' }
      ]
    },
    {
      id: 'improve-meditation', icon: '🌱', category: 'Practice', title: 'Tips on Improving Meditation',
      summary: 'Practical habits that help many meditators sit longer, more regularly and more deeply.',
      keywords: 'tips improve better deeper focus concentration distraction regular habit quality',
      body: [
        'Small, steady changes often make the biggest difference over time.',
        '- Sit at the same time and in the same place each day; regularity builds momentum.\n- Meditate before a heavy meal rather than right after one.\n- Keep the body completely still. A still body helps the mind settle.\n- Treat a wandering mind as part of the practice, not a failure. Each gentle return counts.\n- Let go of expectations. Simply give each sitting your full, loving attention.\n- After each sitting, note a reflection in the Timer. Patterns become clearer over weeks.\n- Increase your time gradually, a few minutes at a time.',
        'If questions come up in your practice, the Meditation FAQs on sos.org, or a local Science of Spirituality center, can help.'
      ],
      links: [
        { label: 'Meditation FAQs on sos.org', url: 'https://sos.org/meditation/meditation-faq/' }
      ]
    },
    {
      id: 'benefits', icon: '✨', category: 'Why meditate', title: 'Benefits of Meditation',
      summary: 'Why people meditate: a calmer mind, steadier focus, and a deeper sense of peace and purpose.',
      keywords: 'benefits why stress peace calm health happiness focus sleep anxiety research',
      body: [
        'People who meditate regularly often describe a calmer, clearer mind and a greater ability to respond to life’s ups and downs with patience. Many find that their focus, relationships and sense of well-being improve over time.',
        'Research on meditation has reported benefits such as reduced stress for many people. Meditation is not a substitute for medical or mental health care; please talk with a health professional about any health concern.',
        'Beyond these everyday benefits, Science of Spirituality presents meditation as a path to spiritual growth and inner peace. Read more on sos.org.'
      ],
      links: [
        { label: 'Benefits of Meditation on sos.org', url: 'https://sos.org/benefits-from-meditation/' }
      ]
    },
    {
      id: 'know-the-masters', icon: '🙏', category: 'Science of Spirituality', title: 'Know the Masters',
      summary: 'Learn about Sant Rajinder Singh Ji Maharaj, spiritual head of Science of Spirituality, and the role of a spiritual Master.',
      keywords: 'master masters sant rajinder singh ji maharaj guru lineage teacher spiritual head darshan kirpal',
      pending: true,
      links: [
        { label: 'Sant Rajinder Singh Ji Maharaj', url: 'https://sos.org/sant-rajinder-singh/' },
        { label: 'The Spiritual Master', url: 'https://sos.org/spirituality/spiritual-master/' },
        { label: 'Benefits of a Spiritual Guide', url: 'https://sos.org/benefits-of-a-spiritual-guide/' }
      ]
    },
    {
      id: 'spiritual-goals', icon: '🎯', category: 'Science of Spirituality', title: 'Spiritual Goals',
      summary: 'Explore the purpose of life and the spiritual goals that meditation helps us move toward.',
      keywords: 'goal goals purpose meaning life soul self knowledge god realization',
      pending: true,
      links: [
        { label: 'Finding Your True Purpose', url: 'https://sos.org/spirituality/finding-your-true-purpose/' }
      ]
    },
    {
      id: 'spiritual-teachings', icon: '📖', category: 'Science of Spirituality', title: 'Spiritual Teachings',
      summary: 'The teachings of Science of Spirituality on spiritual growth, awareness and living an ethical life.',
      keywords: 'teachings philosophy spirituality growth awareness ethical living vegetarian nonviolence',
      pending: true,
      links: [
        { label: 'Spiritual Growth', url: 'https://sos.org/spirituality/spiritual-growth/' },
        { label: 'Spiritual Awareness', url: 'https://sos.org/spirituality/spiritual-awareness/' }
      ]
    },
    {
      id: 'wandering-mind', icon: '🌀', category: 'Practice', title: 'When the Mind Wanders',
      summary: 'Thoughts are natural. How to meet a busy mind with patience instead of frustration.',
      keywords: 'thoughts wandering mind busy distracted restless noise monkey mind',
      body: [
        'Almost everyone finds the mind wandering, especially at first. This is not a sign that meditation is “not working.”',
        'When you notice you have drifted into thought, that moment of noticing is itself a success. Without judging yourself, gently bring your attention back. Over weeks and months these returns become quicker and the periods of stillness longer.',
        'It can help to sit at a time when the mind is naturally quieter, such as early morning, and to avoid stimulating activities right before you sit.'
      ],
      links: [{ label: 'Meditation FAQs on sos.org', url: 'https://sos.org/meditation/meditation-faq/' }]
    },
    {
      id: 'daily-habit', icon: '📅', category: 'Practice', title: 'Building a Daily Practice',
      summary: 'Consistency matters more than length. How to make meditation part of every day.',
      keywords: 'habit daily routine consistency streak schedule time morning discipline regular',
      body: [
        'A shorter sitting done every day usually helps more than a long sitting done now and then.',
        '- Pick a daily target you can keep, and set it on the Today screen.\n- Link meditation to something you already do, such as waking up.\n- Use the Timer so you are not watching the clock.\n- Watch your streak and consistency in Insights, but be gentle with yourself on a missed day. Simply begin again.'
      ],
      links: []
    },
    {
      id: 'meditation-space', icon: '🕯️', category: 'Getting started', title: 'Creating a Space to Meditate',
      summary: 'A quiet, simple corner can make it easier to settle in each day.',
      keywords: 'space room place corner quiet environment cushion chair setup',
      body: [
        'Any quiet spot will do. What helps most is that it is comfortable, reasonably quiet, and used regularly.',
        '- Choose a place where you are unlikely to be interrupted.\n- Keep a comfortable cushion or chair there.\n- Put your phone on silent (the Timer keeps the screen on so the end bell can play).\n- A light blanket can keep you warm during longer sittings.'
      ],
      links: []
    },
    {
      id: 'effective-time', icon: '⏳', category: 'Using this app', title: 'What Is “Effective” Meditation Time?',
      summary: 'How Meditation Copilot combines minutes and quality to estimate progress toward 10,000 hours.',
      keywords: 'effective quality index minutes hours 10000 roadmap calculation formula',
      body: [
        'Meditation Copilot counts “effective” time: minutes sat multiplied by the quality you give each sitting. For example, 60 minutes at 75% quality counts as 45 effective minutes.',
        'Quality is your own honest, gentle estimate of how settled and absorbed the sitting felt. It is a personal tool for reflection, not a measure of spiritual progress.',
        'The Roadmap adds up your effective hours and shows how far you are along the way to 10,000 hours, with milestones along the way.'
      ],
      links: []
    },
    {
      id: 'using-timer', icon: '🔔', category: 'Using this app', title: 'Using the Timer and Reflections',
      summary: 'Start a sitting, settle in for 10 seconds, and record reflections and experiences afterward.',
      keywords: 'timer bell sound start end reflection experiences journal log save how to',
      body: [
        '- Choose a length or an open sitting, then tap Begin sitting.\n- You get 10 seconds to settle in before the timer starts. Tap Skip to start right away.\n- Choose whether a bell rings at the start and at the end. Use Preview to hear it.\n- When your time is complete you can keep sitting; tap End when ready.\n- Rate the depth of the sitting and add your Reflection & Experiences. Everything stays on your device.'
      ],
      links: []
    },
    {
      id: 'find-center', icon: '📍', category: 'Science of Spirituality', title: 'Find a Center or Program',
      summary: 'Meditate with others at a local Science of Spirituality center or join a program online.',
      keywords: 'center centre local group program event online webinar community minneapolis near me',
      pending: true,
      links: [
        { label: 'Find a Center', url: 'https://sos.org/find-center/' },
        { label: 'Online Programs', url: 'https://sos.org/online-programs/' },
        { label: 'Find Local Programs', url: 'https://sos.org/find-local-programs/' }
      ]
    },
    {
      id: 'meditation-faq', icon: '❓', category: 'Science of Spirituality', title: 'Meditation FAQs',
      summary: 'Answers to common questions about meditation from Science of Spirituality.',
      keywords: 'faq questions answers common problems help',
      pending: true,
      links: [{ label: 'Meditation FAQs on sos.org', url: 'https://sos.org/meditation/meditation-faq/' }]
    },
    {
      id: 'spiritual-quotes', icon: '💬', category: 'Science of Spirituality', title: 'Spiritual Quotes',
      summary: 'Inspiring quotes from Sant Rajinder Singh Ji Maharaj on sos.org.',
      keywords: 'quotes quote inspiration wisdom words thought',
      pending: true,
      links: [{ label: 'Spiritual Quotes on sos.org', url: 'https://sos.org/spiritual-quotes/' }]
    }
  ]
};
