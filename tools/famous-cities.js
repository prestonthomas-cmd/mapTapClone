// Cities a typical player is likely to place without hesitation. Used to pull
// well-known places toward the early (easier) rounds regardless of population,
// and to keep populous-but-obscure cities out of round one.
module.exports = [
  // Europe
  'London|GB','Manchester|GB','Liverpool|GB','Edinburgh|GB','Dublin|IE','Paris|FR','Marseille|FR',
  'Lyon|FR','Nice|FR','Bordeaux|FR','Toulouse|FR','Cannes|FR','Monaco|MC','Madrid|ES','Barcelona|ES',
  'Valencia|ES','Seville|ES','Sevilla|ES','Bilbao|ES','Málaga|ES','Palma|ES','Lisbon|PT','Lisboa|PT',
  'Porto|PT','Rome|IT','Roma|IT','Milan|IT','Milano|IT','Naples|IT','Napoli|IT','Turin|IT','Torino|IT',
  'Venice|IT','Venezia|IT','Florence|IT','Firenze|IT','Bologna|IT','Palermo|IT','Pisa|IT','Verona|IT',
  'Berlin|DE','Munich|DE','München|DE','Hamburg|DE','Frankfurt am Main|DE','Cologne|DE','Köln|DE',
  'Düsseldorf|DE','Stuttgart|DE','Dresden|DE','Leipzig|DE','Nuremberg|DE','Vienna|AT','Wien|AT',
  'Salzburg|AT','Innsbruck|AT','Zurich|CH','Zürich|CH','Geneva|CH','Genève|CH','Bern|CH','Basel|CH',
  'Amsterdam|NL','Rotterdam|NL','The Hague|NL','Utrecht|NL','Brussels|BE','Bruxelles|BE','Antwerp|BE',
  'Bruges|BE','Brugge|BE','Luxembourg|LU','Copenhagen|DK','København|DK','Oslo|NO','Bergen|NO',
  'Stockholm|SE','Gothenburg|SE','Göteborg|SE','Helsinki|FI','Reykjavík|IS','Reykjavik|IS',
  'Tallinn|EE','Riga|LV','Vilnius|LT','Warsaw|PL','Warszawa|PL','Kraków|PL','Krakow|PL','Gdańsk|PL',
  'Prague|CZ','Praha|CZ','Brno|CZ','Bratislava|SK','Budapest|HU','Ljubljana|SI','Zagreb|HR',
  'Dubrovnik|HR','Split|HR','Sarajevo|BA','Belgrade|RS','Beograd|RS','Podgorica|ME','Skopje|MK',
  'Tirana|AL','Pristina|XK','Sofia|BG','Bucharest|RO','București|RO','Chișinău|MD','Kyiv|UA','Kiev|UA',
  'Odesa|UA','Odessa|UA','Lviv|UA','Minsk|BY','Moscow|RU','Moskva|RU','Saint Petersburg|RU',
  'Novosibirsk|RU','Vladivostok|RU','Sochi|RU','Kazan|RU','Yekaterinburg|RU','Athens|GR','Athína|GR',
  'Thessaloniki|GR','Heraklion|GR','Santorini|GR','Thera|GR','Istanbul|TR','Ankara|TR','Izmir|TR',
  'Antalya|TR','Valletta|MT','Nicosia|CY','Andorra la Vella|AD','San Marino|SM','Vatican City|VA',
  'Vaduz|LI','Reykjanesbaer|IS','Belfast|GB','Cardiff|GB','Glasgow|GB','Birmingham|GB','Leeds|GB',

  // Middle East & North Africa
  'Cairo|EG','Alexandria|EG','Luxor|EG','Giza|EG','Sharm el-Sheikh|EG','Tel Aviv|IL','Jerusalem|IL',
  'Haifa|IL','Amman|JO','Petra|JO','Beirut|LB','Damascus|SY','Aleppo|SY','Baghdad|IQ','Basra|IQ',
  'Erbil|IQ','Tehran|IR','Isfahan|IR','Shiraz|IR','Mashhad|IR','Riyadh|SA','Jeddah|SA','Mecca|SA',
  'Makkah|SA','Medina|SA','Dubai|AE','Abu Dhabi|AE','Doha|QA','Kuwait City|KW','Manama|BH',
  'Muscat|OM','Sanaa|YE',"Sana'a|YE",'Casablanca|MA','Rabat|MA','Marrakesh|MA','Marrakech|MA',
  'Fez|MA','Tangier|MA','Algiers|DZ','Tunis|TN','Tripoli|LY','Benghazi|LY','Khartoum|SD',

  // Sub-Saharan Africa
  'Lagos|NG','Abuja|NG','Kano|NG','Accra|GH','Abidjan|CI','Dakar|SN','Bamako|ML','Timbuktu|ML',
  'Ouagadougou|BF','Niamey|NE','Conakry|GN','Freetown|SL','Monrovia|LR','Lomé|TG','Cotonou|BJ',
  'Yaoundé|CM','Douala|CM','Libreville|GA','Brazzaville|CG','Kinshasa|CD','Lubumbashi|CD',
  'Luanda|AO','Windhoek|NA','Gaborone|BW','Harare|ZW','Victoria Falls|ZW','Lusaka|ZM','Lilongwe|MW',
  'Maputo|MZ','Antananarivo|MG','Port Louis|MU','Victoria|SC','Moroni|KM','Cape Town|ZA',
  'Johannesburg|ZA','Durban|ZA','Pretoria|ZA','Maseru|LS','Mbabane|SZ','Nairobi|KE','Mombasa|KE',
  'Kampala|UG','Kigali|RW','Bujumbura|BI','Dodoma|TZ','Dar es Salaam|TZ','Zanzibar|TZ',
  'Addis Ababa|ET','Asmara|ER','Djibouti|DJ','Mogadishu|SO','Juba|SS','N\'Djamena|TD','Bangui|CF',

  // Asia
  'Tokyo|JP','Osaka|JP','Kyoto|JP','Yokohama|JP','Sapporo|JP','Hiroshima|JP','Nagoya|JP','Fukuoka|JP',
  'Okinawa|JP','Naha|JP','Seoul|KR','Busan|KR','Incheon|KR','Pyongyang|KP','Beijing|CN','Shanghai|CN',
  'Hong Kong|HK','Macau|MO','Macao|MO','Guangzhou|CN','Shenzhen|CN','Chengdu|CN','Xi\'an|CN',
  'Chongqing|CN','Wuhan|CN','Harbin|CN','Kunming|CN','Lhasa|CN','Urumqi|CN','Qingdao|CN','Tianjin|CN',
  'Taipei|TW','Kaohsiung|TW','Ulaanbaatar|MN','Hanoi|VN','Ho Chi Minh City|VN','Da Nang|VN',
  'Bangkok|TH','Chiang Mai|TH','Phuket|TH','Phnom Penh|KH','Siem Reap|KH','Vientiane|LA',
  'Yangon|MM','Naypyidaw|MM','Mandalay|MM','Kuala Lumpur|MY','Penang|MY','George Town|MY',
  'Singapore|SG','Jakarta|ID','Bali|ID','Denpasar|ID','Surabaya|ID','Bandung|ID','Medan|ID',
  'Manila|PH','Cebu City|PH','Davao|PH','Bandar Seri Begawan|BN','Dili|TL','Delhi|IN','New Delhi|IN',
  'Mumbai|IN','Bangalore|IN','Bengaluru|IN','Kolkata|IN','Chennai|IN','Hyderabad|IN','Jaipur|IN',
  'Agra|IN','Varanasi|IN','Goa|IN','Kochi|IN','Pune|IN','Ahmedabad|IN','Karachi|PK','Lahore|PK',
  'Islamabad|PK','Peshawar|PK','Dhaka|BD','Chittagong|BD','Kathmandu|NP','Thimphu|BT','Colombo|LK',
  'Malé|MV','Male|MV','Kabul|AF','Kandahar|AF','Tashkent|UZ','Samarkand|UZ','Bukhara|UZ',
  'Astana|KZ','Nur-Sultan|KZ','Almaty|KZ','Bishkek|KG','Dushanbe|TJ','Ashgabat|TM','Baku|AZ',
  'Tbilisi|GE','Yerevan|AM',

  // Oceania
  'Sydney|AU','Melbourne|AU','Brisbane|AU','Perth|AU','Adelaide|AU','Canberra|AU','Darwin|AU',
  'Hobart|AU','Cairns|AU','Gold Coast|AU','Auckland|NZ','Wellington|NZ','Christchurch|NZ',
  'Queenstown|NZ','Suva|FJ','Nadi|FJ','Port Moresby|PG','Nouméa|NC','Papeete|PF','Apia|WS',
  "Nuku'alofa|TO",'Port Vila|VU','Honiara|SB','Tarawa|KI','Funafuti|TV','Majuro|MH','Palikir|FM',
  'Ngerulmud|PW','Yaren|NR','Hagåtña|GU','Pago Pago|AS','Avarua|CK',

  // North America
  'New York City|US','New York|US','Los Angeles|US','Chicago|US','Houston|US','Phoenix|US',
  'Philadelphia|US','San Antonio|US','San Diego|US','Dallas|US','San Francisco|US','Seattle|US',
  'Denver|US','Boston|US','Washington|US','Washington, D.C.|US','Miami|US','Atlanta|US',
  'Las Vegas|US','New Orleans|US','Detroit|US','Minneapolis|US','Portland|US','Nashville|US',
  'Austin|US','Salt Lake City|US','Anchorage|US','Honolulu|US','Orlando|US','Pittsburgh|US',
  'Cleveland|US','St. Louis|US','Kansas City|US','Baltimore|US','Sacramento|US','Albuquerque|US',
  'Toronto|CA','Montreal|CA','Montréal|CA','Vancouver|CA','Calgary|CA','Ottawa|CA','Edmonton|CA',
  'Quebec City|CA','Québec|CA','Winnipeg|CA','Halifax|CA','Whitehorse|CA','Yellowknife|CA',
  'Mexico City|MX','Guadalajara|MX','Monterrey|MX','Cancún|MX','Cancun|MX','Tijuana|MX',
  'Oaxaca|MX','Mérida|MX','Acapulco|MX','Puebla|MX','Havana|CU','La Habana|CU','Nassau|BS',
  'Kingston|JM','Port-au-Prince|HT','Santo Domingo|DO','San Juan|PR','Bridgetown|BB',
  'Port of Spain|TT','Castries|LC','St. George\'s|GD','Roseau|DM','Basseterre|KN',
  'St. John\'s|AG','Kingstown|VC','Belmopan|BZ','Guatemala City|GT','San Salvador|SV',
  'Tegucigalpa|HN','Managua|NI','San José|CR','Panama City|PA','Nuuk|GL','Hamilton|BM',
  'Willemstad|CW','Oranjestad|AW','George Town|KY',

  // South America
  'São Paulo|BR','Sao Paulo|BR','Rio de Janeiro|BR','Brasília|BR','Brasilia|BR','Salvador|BR',
  'Recife|BR','Fortaleza|BR','Manaus|BR','Belo Horizonte|BR','Porto Alegre|BR','Curitiba|BR',
  'Buenos Aires|AR','Córdoba|AR','Rosario|AR','Mendoza|AR','Ushuaia|AR','Bariloche|AR',
  'Santiago|CL','Valparaíso|CL','Punta Arenas|CL','Lima|PE','Cusco|PE','Cuzco|PE','Arequipa|PE',
  'Quito|EC','Guayaquil|EC','Bogotá|CO','Bogota|CO','Medellín|CO','Cartagena|CO','Cali|CO',
  'Caracas|VE','Maracaibo|VE','La Paz|BO','Sucre|BO','Santa Cruz de la Sierra|BO','Asunción|PY',
  'Montevideo|UY','Georgetown|GY','Paramaribo|SR','Cayenne|GF','Stanley|FK'
];
