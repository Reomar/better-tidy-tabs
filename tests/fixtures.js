// Synthetic titles, URLs and vectors only; vectors test mechanics, not model accuracy.
(() => {
  const vec = (degrees) => [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180), 0];
  const tab = (id, title, url, degrees) => ({ id, title, url, vector: vec(degrees) });
  globalThis.BetterTidyTabsFixtures = [
    { name: 'mixed-site-payments', label: 'Payments', tabs: [
      tab('a', 'Checkout payment callback', 'https://github.com/team/store/issues/1', 0),
      tab('b', 'Payment webhook documentation', 'https://payments.test/webhooks', 30),
      tab('c', 'Debug payment callback - Google Search', 'https://google.com/search?q=payment+callback', 60),
    ], together: [['a','b'], ['b','c']], separate: [] },
    { name: 'related-repositories', label: 'Development', tabs: [
      tab('a', 'Build payment SDK', 'https://github.com/team/sdk', 0),
      tab('b', 'Integrate payment SDK in store', 'https://github.com/team/store', 30),
      tab('c', 'Payment SDK integration docs', 'https://docs.test/sdk', 55),
    ], together: [['a','b'],['a','c']], separate: [] },
    { name: 'unrelated-youtube', label: null, tabs: [
      tab('a', 'Make fresh pasta', 'https://youtube.com/watch?v=cooking', 0),
      tab('b', 'JavaScript promises tutorial', 'https://youtube.com/watch?v=coding', 90),
    ], together: [], separate: [['a','b']] },
    { name: 'travel-across-sites', label: 'Travel Planning', tabs: [
      tab('a', 'Flights to Rome', 'https://flights.test/rome', 0),
      tab('b', 'Rome hotels', 'https://hotels.test/rome', 25),
      tab('c', 'Rome weekend itinerary', 'https://travel.test/rome', 45),
    ], together: [['a','b'],['a','c']], separate: [] },
    { name: 'ordinary-host-supports-match', label: 'Laptop Shopping', tabs: [
      tab('a', 'Compare laptop prices', 'https://shop.test/laptops', 0),
      tab('b', 'Laptop battery options', 'https://shop.test/battery', 66),
    ], together: [['a','b']], separate: [] },
    { name: 'repository-supports-match', label: 'API Integration', tabs: [
      tab('a', 'Configure API integration', 'https://github.com/team/sdk/issues/1', 0),
      tab('b', 'SDK credential setup', 'https://github.com/team/sdk/blob/main/README.md', 66),
    ], together: [['a','b']], separate: [] },
    { name: 'different-repositories-unrelated', label: null, tabs: [
      tab('a', 'Pasta recipe collection', 'https://github.com/chef/recipes', 0),
      tab('b', 'OAuth authentication library', 'https://github.com/team/auth', 90),
    ], together: [], separate: [['a','b']] },
    { name: 'search-and-docs', label: 'OAuth Setup', tabs: [
      tab('a', 'Fix OAuth callback', 'https://google.com/search?q=oauth+callback', 0),
      tab('b', 'OAuth redirect documentation', 'https://auth.test/redirects', 35),
      tab('c', 'Garden planting calendar', 'https://google.com/search?q=planting', 130),
    ], together: [['a','b']], separate: [['a','c'],['b','c']] },
    { name: 'mixed-language', label: 'Programming', tabs: [
      tab('a', '\u062a\u0639\u0644\u0645 \u0627\u0644\u0628\u0631\u0645\u062c\u0629 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629', 'https://learn.test/arabic', 0),
      tab('b', 'Programming basics', 'https://learn.test/english', 30),
    ], together: [['a','b']], separate: [] },
    { name: 'bridge-tab-does-not-join-unrelated-work', label: 'Development', tabs: [
      tab('b', 'Broad software introduction', 'https://docs.test/intro', 0),
      tab('a', 'Database connection tuning', 'https://database.test/tuning', -50),
      tab('c', 'Drawing icons in design tools', 'https://design.test/icons', 50),
    ], together: [['a','b']], separate: [['a','c']] },
    { name: 'two-subjects-one-host', label: 'Database', tabs: [
      tab('a', 'Database transaction isolation', 'https://wiki.test/database', 0),
      tab('b', 'Database deadlock handling', 'https://wiki.test/deadlocks', 25),
      tab('c', 'Italian pasta history', 'https://wiki.test/pasta', 140),
    ], together: [['a','b']], separate: [['a','c'],['b','c']] },
    { name: 'one-residual-tab', label: 'React Motion', tabs: [
      tab('a', 'React animation tutorial', 'https://youtube.com/watch?v=react', 0),
      tab('b', 'React spring transitions', 'https://motion.test/react', 30),
      tab('c', 'Flight booking receipt', 'https://mail.test/travel', 140),
    ], together: [['a','b']], separate: [['a','c'],['b','c']] },
  ];
})();
