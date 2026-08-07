# Don Miguel App – Final Version 3.1

## Final umgesetzt

- Menü mit zwölf symmetrischen Link-Kacheln und einheitlichem goldenen Punkt.
- Onplug ist enthalten.
- Impressum und Datenschutz verlinken auf die offizielle Homepage.
- Das Release-Banner lädt das tatsächlich neueste Video direkt aus der Upload-Playlist des YouTube-Kanals – unabhängig von den Genre-Playlists.
- „Jetzt anhören“ startet genau dieses neueste Video.
- Die Musikbibliothek verwendet feste YouTube-Playlist-IDs für Alle, Bachata, Merengue, Salsa, Reggaetón, Baladas und Mixtape.
- Eine zentrale Trackliste, Suche, Genre-Wechsel, Mini-Player, Vollbild-Player und Kommentare.

## Start

`DonMiguelApp.sln` in Visual Studio öffnen und mit F5 starten.

Nach einem Update einmal `Strg + F5` drücken, damit der Service-Worker-Cache erneuert wird.


## Neu in 3.1

- Vollbild-Preloader im Don-Miguel-Design beim App-Start.
- Goldener Ladeindikator und Status „Musik wird geladen …“.
- Der Preloader verschwindet nach dem Laden der YouTube-Daten; bei Fehlern oder langsamer Verbindung spätestens nach acht Sekunden.
- Die App bleibt während des Startvorgangs für Screenreader sauber verborgen und wird danach freigegeben.
- Service-Worker-Cache auf 3.2.0 aktualisiert.


## Version 3.5.0
- Preloader: festgelegtes DMC-Logo, Text „Musik wird geladen“.
- Kein Autoplay beim Öffnen der App. Das neueste Video wird nur vorbereitet; Wiedergabe startet erst nach Nutzeraktion.


## Version 3.4
- Preloader nach finalem Gold-auf-Schwarz-Entwurf umgesetzt.
- Eigenes dezentes DMC-Preloaderlogo als separates Asset.
- Nur der Text „Musik wird geladen“.
- Sieben animierte goldene Ladepunkte.


## Version 3.6.0
- International English UI labels
- Smaller, subtler animated DMC preloader (CSS pulse + loading dots)
- Links menu reorganized into Listen & Buy Music, Official Links, Social Media and Info
- App version updated to 3.6.0


## v3.7
- Preloader logo removed; Loading + animated dots only.
- Onplug removed from the links menu.
- Branded/local service icons added for music services, official links and social media.
- X/Twitter added to Social Media. TikTok and X tiles are present but intentionally disabled until exact profile URLs are configured.
