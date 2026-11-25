# News archive configuration: which old WordPress pages become news articles,
# their event dates, categories, and which sub-pages are grouped under them.
# date: ISO date used for sorting; when: text shown to readers.

ARTICLES = [
    # slug (new URL /news/<slug>/), old path, date, when, title, category, related old paths
    ("youth-angels-day-camp-2007", "/yadcfeb7th2007/", "2007-02-10", "February 10, 2007",
     "Youth Angels Day Camp 2007", "Youth & Family", []),
    ("satpal-garg-talks-2007", "/news-archive/past-events/satpalgargnov2007/", "2007-11-01", "November 2007",
     "Satpal Garg Talks in Minneapolis", "Talks & Retreats", []),
    ("don-hoes-talks-2008", "/don-hoes-2008-meditation-talk/", "2008-01-25", "January 25–26, 2008",
     "Don Hoes Meditation Talks", "Talks & Retreats", []),
    ("amarnath-akhand-2008", "/news-archive/past-events/amarnathakhandapril2008/", "2008-04-04", "April 4–8, 2008",
     "Amarnath Akhand Talks", "Talks & Retreats", ["/news-archive/past-events/amarnathakhand-april4-8-2008/"]),
    ("retreat-into-peace-2008", "/news-archive/retreatintopeace-august-29-30-2008/", "2008-08-29", "August 29–30, 2008",
     "Retreat into Peace", "Talks & Retreats", ["/news-archive/past-events/aug2008-retreatscajawea/"]),
    ("meditation-center-open-house-2015", "/meditation-center-open-house/", "2015-09-12", "September 12, 2015",
     "Meditation Center Open House in Columbia Heights", "Center News", []),
    ("ravi-kohli-retreat-2015", "/news-archive/meditation-retreat-with-ravi-kohli/", "2015-09-25", "September 25–27, 2015",
     "Meditation Retreat with Shri Ravi Kohli", "Talks & Retreats", ["/ravi-kohli-talks-925-27/"]),
    ("spiritual-awakening-series-2015", "/spiritualawakening2019/", "2015-10-16", "October–November 2015",
     "Spiritual Awakening through Meditation: A Series of Four Sessions", "Talks & Retreats", []),
    ("andrew-vidich-talks-2015", "/spiritualawakening2019/andrewvidichtalks2015/", "2015-11-20", "November 20–22, 2015",
     "Andrew Vidich: Sharing Meditation & Wisdom", "Talks & Retreats", []),
    ("youth-angels-day-camp-2016", "/youth-angels-day-camp-2016/", "2016-02-27", "February 27, 2016",
     "Youth Angels Day Camp 2016", "Youth & Family", []),
    ("carlos-lozano-talk-2016", "/spiritualawakening2019/talk-by-carlos-losano-april-2016/", "2016-04-02", "April 2016",
     "Talk by Carlos Lozano (English & Spanish)", "Talks & Retreats", ["/espanol/"]),
    ("peace-fest-2018", "/peacefest18/", "2018-06-23", "June 23, 2018",
     "Peace Fest 2018", "Peace Fest", ["/peacefest18/press-release/", "/peacefest18/symposium/",
      "/peacefest18/symposium/mustafa_igdelioglu/", "/meditation-yoga/", "/peacefest18/live-music/",
      "/peacefest18/food-court/", "/peacefest18/peace-fest-vendors/", "/peacefest18/kids-families/",
      "/peacefest18/competition/", "/peacefest18/competition/guidelines/"]),
    ("peace-fest-2018-news", "/news-archive/peace-fest-2018-news-article/", "2018-06-27", "June 2018",
     "Peace Fest 2018: In the News", "Press", []),
    ("international-day-of-peace-2018", "/international-day-of-peace/", "2018-09-21", "September 21, 2018",
     "International Day of Peace", "Interfaith", []),
    ("achieve-your-highest-potential-2019", "/achieve-your-highest-potential-through-meditation/", "2019-02-01", "February 1, 2019",
     "Achieve Your Highest Potential through Meditation", "Talks & Retreats", []),
    ("youth-family-meditation-camp-2019", "/yfmc-2019/", "2019-03-02", "March 2, 2019",
     "Youth & Family Meditation Camp 2019", "Youth & Family", []),
    ("ravi-kohli-talks-2019", "/meditation-talks-ravi-kohli-march2019/", "2019-03-22", "March 22–24, 2019",
     "Meditation Talks by Ravi Kohli", "Talks & Retreats", []),
    ("kansas-city-family-camp-2019", "/kc-yfmc-2019/", "2019-04-20", "April 20, 2019",
     "Youth & Family Meditation Camp, Kansas City", "Youth & Family", []),
    ("art-science-of-meditation-2019", "/art-science-meditation-05032019/", "2019-05-03", "May 3, 2019",
     "The Art & Science of Meditation", "Talks & Retreats", []),
    ("peace-fest-2019", "/peacefest19/", "2019-06-29", "June 29, 2019",
     "Peace Fest 2019", "Peace Fest", ["/peacefest19/competition/"]),
    ("peace-fest-2019-news", "/news-archive/peace-fest-2018-news-article-2/", "2019-07-23", "July 2019",
     "Peace Fest 2019: In the News", "Press", []),
    ("interfaith-peace-symposium-2019", "/interfaith-symposium-non-violence/", "2019-09-27", "September 27, 2019",
     "Interfaith Peace Symposium on Non-Violence", "Interfaith", []),
    ("youth-family-meditation-camp-2020", "/youth-family-meditation/youth-family-meditation-camp-2020/", "2020-02-15", "February 15, 2020",
     "Youth & Family Meditation Camp 2020", "Youth & Family", ["/youth-family-meditation/"]),
    ("family-camp-north-carolina-2020", "/youth-family-meditation/yfmc-2020-rtp-nc/", "2020-03-28", "March 28, 2020",
     "Youth & Family Meditation Camp, North Carolina", "Youth & Family", []),
    ("five-year-celebration-2020", "/5-yr-celebration/", "2020-06-13", "June 13, 2020",
     "Meditation Center 5-Year Celebration", "Center News", []),
    ("yoga-day-2021", "/home-2/yogaday2021/", "2021-06-21", "June 21, 2021",
     "Meditation as the Art & Science of Spiritual Yoga", "Talks & Retreats", []),
    ("diwali-2024", "/diwali2024/", "2024-10-31", "Fall 2024",
     "Diwali Celebration 2024", "Celebrations", []),
    ("ten-year-anniversary-2025", "/10-year-anniversary/", "2025-05-25", "May 25, 2025",
     "Meditation Center Celebrates 10 Years of Peace and Harmony", "Center News",
     ["/sos-meditation-center-celebrates-10-years-of-cultivating-peace-and-harmony-in-the-minneapolis/"]),
]

# Coverage published elsewhere: summaries are our own words; readers follow the link.
EXTERNAL = [
    ("2015-09-04", "September 4, 2015", "New Meditation Center in the Minneapolis–St. Paul Neighborhood",
     "PR Newswire", "https://www.prnewswire.com/news-releases/new-meditation-center-in-the-minneapolis-st-paul-neighborhood-300138244.html",
     "Press release announcing the open house for the new Science of Spirituality meditation center in Columbia Heights.", "Press"),
    ("2017-03-13", "March 13, 2017", "Meditation Centers Offer Paths to Peace and Healing",
     "The Northeaster", "https://www.mynortheaster.com/news/meditation-centers-offer-paths-to-peace-and-healing-part-1-of-a-2-part-series",
     "A community newspaper profile of the center: how it began in a former church building in 2015, its free weekly sessions, and its welcome to people of all faiths.", "Press"),
    ("2025-05-25", "May 25, 2025", "SOS Meditation Center Celebrates 10 Years (press release)",
     "PRLog", "https://www.prlog.org/13078641-sos-meditation-center-celebrates-10-years-of-cultivating-peace-and-harmony-in-the-minneapolis.pdf",
     "Press release for the center's 10-year anniversary and its Meditation Symposium on June 13, 2025.", "Press"),
]

# Pages folded into the About page
ABOUT = ["/aboutus/", "/contactus/", "/contactus/directions/"]

# Hub pages and retired pages: where their old addresses should go
HUBS_TO_NEWS = ["/news-archive/", "/news-archive/past-events/", "/news-archive/meditation-center-news/",
                "/peace-fest/", "/interfaith-peace-initiative/", "/speakers/"]

# Text edits applied to article HTML (children's names and other private details removed)
EDITS = {
    "/news-archive/past-events/satpalgargnov2007/": [
        ("Roshani, Anika, Kishore and Anant managed the seva with very little help from Rajan and Lokesh.",
         "The children managed the seva with very little adult help."),
    ],
    "/international-day-of-peace/": [
        (" - Oluwatamilore (age 8) and Oluwateniola (age 5)", ""),
    ],
}
# Paragraphs replaced entirely (matched by a unique phrase inside them)
PARA_REPLACE = {
    "/international-day-of-peace/": [
        ("a boy by the name of Jalue Dorje",
         "<p><strong>Taksham Rinpoche:</strong> Recognized in 2007 as the 8th Terchen Taksham Rinpoche, "
         "reported as the first Tibetan Buddhist reincarnation born in Minnesota.</p>"),
    ],
}
