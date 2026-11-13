# Nefertem

Nederlandstalige praktijkwebsite voor **Veronique Wostyn**, schoonheidsspecialist en thuisverpleegkundige in Roeselare. Adres: Stationsdreef 215, 8800 Roeselare, België.

## Stack

De toepasselijke frameworks uit [null-newton/toolbox](https://github.com/null-newton/toolbox): React 19, TypeScript 6, Vite 8, Tailwind CSS 4, React Router 7, Lucide React en Supabase JS 2. Functies zoals video-muxers en achtergrondverwijdering uit de toolbox zijn niet nodig voor deze praktijkwebsite.

## Lokaal starten

Node.js 22.12+ of een recente Node.js 24 en pnpm zijn vereist.

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

Vul in `.env.local` de Supabase-project-URL en publieke publishable/anon-key in. Gebruik **nooit** een service-role-key in een `VITE_`-variabele. `.env.local` staat buiten versiebeheer. `pnpm-workspace.yaml` gebruikt `nodeLinker: hoisted`, zodat het project ook op een exFAT-schijf zonder symlinks kan worden geïnstalleerd.

```sh
pnpm build
pnpm test
```

## Supabase activeren

1. Open het Supabase-dashboard van je project, ga naar **SQL Editor** en voer [supabase/migrations/001_initial.sql](supabase/migrations/001_initial.sql) eenmalig uit. Dit maakt de tabellen, rechten, policies en atomaire voorraadfunctie aan. De migratie bevat alleen praktijkgegevens, geen fictief aanbod.
2. Maak je beheerder via **Authentication → Users → Add user**. Gebruik een eigen wachtwoord. Er is bewust geen openbare registratiepagina.
3. Kopieer het gebruikers-ID en voer als projecteigenaar in de SQL Editor uit:

```sql
insert into public.admins(user_id) values ('HIER-HET-GEBRUIKERS-ID');
```

4. Schakel openbare registratie uit bij de Auth-instellingen als deze niet nodig is. Stel de uiteindelijke Site URL in op je eigen domein.
5. Ga naar `/admin`, log in en vul onder **Praktijkgegevens** het e-mailadres en telefoonnummer aan. Daar kun je ook het logo uploaden (of een HTTPS-afbeeldingslink plakken); het verschijnt dan in de kop en voet van de website in plaats van de tekst “nefertem”.
6. Voeg producten, diensten en berichten toe. Nieuwe inhoud begint als concept; vink zichtbaarheid/publicatie aan wanneer de inhoud klaar is.

De publieke sleutel geeft geen beheerrechten. Alleen gebruikers in `admins` kunnen wijzigen. Bezoekers lezen uitsluitend gepubliceerd aanbod, gepubliceerde berichten en openbare praktijkgegevens. Voorraad en voorraadgeschiedenis zijn afzonderlijke tabellen met beheerdersrechten. Voorraadwijzigingen gaan via `adjust_stock`, met rijvergrendeling, reden, gebruiker en logboek. Een negatieve voorraad wordt geweigerd.

## Pagina’s en functies

- `/`: praktijkintroductie, schoonheid, thuisverpleging en recente berichten.
- `/schoonheid`: filterbaar aanbod met prijzen, behandeltijd en contactlink.
- `/thuisverpleging`: zorgintroductie en diensten.
- `/over`: Veronique en de praktijk.
- `/journal` en `/journal/:id`: blogs en aankondigingen.
- `/contact`: adres, route, telefoon en e-mail. Het formulier opent de eigen e-mailapp zodra een e-mailadres is ingevuld; het verzendt zelf geen berichten en doet geen automatische boekingen.
- `/admin`: Supabase-login, overzicht, producten/diensten toevoegen/bewerken/verwijderen, berichten toevoegen/bewerken/verwijderen/publiceren, voorraad wijzigen, minimumvoorraad en artikelnummers instellen, voorraadlogboek en praktijkgegevens.

Op het inlogscherm kan een expliciete **voorbeeldomgeving** worden geopend. Deze gebruikt fictieve inhoud in browser-localStorage, geen Supabase-login of database. Die gegevens zijn duidelijk gemarkeerd. Afsluiten herlaadt de echte omgeving. Zonder Supabase-configuratie opent de publieke site met gemarkeerde voorbeeldinhoud. Met configuratie worden fouten getoond in plaats van stilzwijgend fictieve databasegegevens te gebruiken.

## Talen

De website en de beheeromgeving zijn beschikbaar in het Nederlands, Frans en Engels. Bij het eerste bezoek wordt de taal gekozen op basis van de browsertaal (`navigator.languages`); andere talen vallen terug op Nederlands. Bezoekers kunnen rechtsboven (en in de zijbalk van de beheeromgeving) wisselen via NL / FR / EN; die keuze wordt in de browser onthouden. Alle teksten staan in [src/i18n.tsx](src/i18n.tsx).

Alleen de vaste interfaceteksten worden vertaald. Zelf ingevoerde inhoud (aanbod, berichten, de tekst onder *Over Veronique*) verschijnt zoals ingevoerd. Meldingen van de Supabase-functies (uploads en het journal) zijn Nederlands; in het Frans en Engels toont de site daarvoor een vertaalde algemene melding. De bevestigings- en nieuwsmails van het journal blijven Nederlands.

## Afbeeldingen uploaden via ImgBB

Bij producten, diensten, berichten en het logo kun je een bestand kiezen of een bestaande HTTPS-afbeeldingslink plakken. De uploadfunctie stuurt het bestand naar ImgBB en vult de directe afbeeldings-URL automatisch in. Alleen de URL wordt bij het aanbod of bericht opgeslagen; er is geen Supabase Storage-bucket nodig. Uploaden accepteert JPG, PNG, WebP en GIF tot 5 MB en is uitsluitend beschikbaar voor ingelogde beheerders. De voorbeeldomgeving ondersteunt alleen afbeeldingslinks.

De ImgBB-sleutel staat uitsluitend in `IMGBB_API_KEY` op de server. Gebruik hiervoor nooit een `VITE_`-variabele. Het lokale bestand `supabase/functions/.env.local` staat buiten Git. Bij een nieuwe installatie kun je `supabase/functions/.env.example` kopiëren naar dat bestand en je sleutel invullen.

Activeer de functie eenmalig vanuit de projectmap:

```sh
npx supabase login
npx supabase secrets set --env-file supabase/functions/.env.local --project-ref ubgunugdegfzqqidsxcu
npx supabase functions deploy upload-image --project-ref ubgunugdegfzqqidsxcu
```

Gebruik bij een ander Supabase-project diens project-ID. De functiespecifieke `verify_jwt = false` in `supabase/config.toml` laat de functie zelf het gebruiker-token controleren via Supabase Auth. De functie controleert daarna `is_admin` met dezelfde gebruikerrechten, voordat een bestand naar ImgBB wordt verstuurd. De API-sleutel, ImgBB-foutdetails en verwijderlinks worden niet teruggestuurd naar de browser.

De afbeelding wordt geüpload zodra je een bestand kiest. Sla daarna het bericht of aanbod op om de URL te bewaren. Het verwijderen van de afbeelding uit het formulier, het annuleren van een formulier of het verwijderen van een bericht verwijdert de upload niet van ImgBB; beheer die afbeeldingen via ImgBB. Er wordt geen automatische vervaldatum ingesteld.

Controleer na activatie een echte upload met je beheeraccount. Lokaal kun je de servercontroles testen zonder uploads naar ImgBB:

```sh
deno test supabase/functions/upload-image/handler_test.ts
```

## Wachtwoord vergeten en wijzigen

Op het inlogscherm staat **Wachtwoord vergeten?**. Supabase mailt dan een link die terugkeert naar `?herstel=1`, waar je een nieuw wachtwoord kiest. Ingelogd wijzig je je wachtwoord onder **Beheer → Account** (eerst je huidige wachtwoord).

Eenmalig instellen in Supabase onder **Authentication → URL Configuration**: zet de **Site URL** op het publieke adres en voeg dat adres toe bij **Redirect URLs** (bijvoorbeeld `https://jouwdomein.be/**` en voor lokaal `http://127.0.0.1:5173/**`). De standaard-e-mailserver van Supabase verstuurt maar enkele mails per uur; stel voor gebruik in productie een eigen SMTP-server in onder **Authentication → Emails**.

## Journal per e-mail

Bezoekers kunnen zich op `/journal` en onder elk bericht inschrijven. Ze krijgen eerst een bevestigingsmail (dubbele opt-in); pas na bevestiging ontvangen ze meldingen. Elke mail bevat een persoonlijke afmeldlink. Zodra een bericht voor het eerst gepubliceerd wordt (bij opslaan of via de schakelaar), krijgen alle bevestigde abonnees één e-mail met titel, introductie en link. Een bericht wordt nooit twee keer gemeld; verbergen en opnieuw publiceren stuurt niets opnieuw. De e-mails worden verstuurd via [Resend](https://resend.com) door de edge function `journal`.

1. Voer [supabase/migrations/002_journal_subscribers.sql](supabase/migrations/002_journal_subscribers.sql) uit in de SQL Editor. Bestaande gepubliceerde berichten worden als al gemeld gemarkeerd.
2. Maak een Resend-account, verifieer je domein en maak een API-sleutel.
3. Vul in `supabase/functions/.env.local` de waarden `RESEND_API_KEY`, `MAIL_FROM` (afzender op het geverifieerde domein) en `SITE_URL` (publiek adres zonder `#`) in, zie `.env.example`.
4. Activeer:

```sh
npx supabase secrets set --env-file supabase/functions/.env.local --project-ref ubgunugdegfzqqidsxcu
npx supabase functions deploy journal --project-ref ubgunugdegfzqqidsxcu
```

Abonnees staan in de tabel `subscribers`; alleen de edge function kan ze toevoegen of verwijderen. In **Berichten** zie je hoeveel bevestigde abonnees er zijn. Lukt het versturen niet, dan zie je een melding en probeer je het opnieuw door het bericht nog eens op te slaan. Testen zonder echte mails: `deno test supabase/functions/journal/handler_test.ts`.

## Publicatie

`pnpm build` maakt `dist/`. De workflow `.github/workflows/deploy.yml` bouwt en publiceert automatisch na een push naar `main`.

Ga eenmalig in GitHub naar **Settings → Pages → Build and deployment → Source → GitHub Actions**. Start daarna bij **Actions → Website bouwen en publiceren → Run workflow** de workflow als de eerste automatische run plaatsvond voordat Pages geactiveerd was.

De website gebruikt HashRouter en relatieve assetpaden, zodat zowel de project-URL als een later eigen domein werkt. Voorbeeld: `https://null-newton.github.io/de-lotusbloem/#/admin`.

De workflow bevat de door jou aangeleverde **publieke** Supabase-project-URL en publishable-key als standaardwaarden. Deze key is bedoeld voor de browser en verleent geen beheerrechten. Repository-variabelen `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` kunnen de waarden overschrijven. Service-role-keys en wachtwoorden horen nooit in deze workflow of de frontend. `.env.local` blijft buiten de repository.

Op andere hosts zijn geen SPA-rewrites nodig dankzij de hashrouter; de meegeleverde `_redirects` en `vercel.json` kunnen desgewenst worden verwijderd.
## Ontwerp en inhoud

Inspiratie: [Maison Les Grands Chênes](https://www.maisonlesgrandschenes.com), [Fume](https://fume-studio.com), [Alicia Dubuis](https://aliciadubuis.com), [Jakobsen Copenhagen](https://jakobsencopenhagen.com), [Norma](https://nor.ma). Eigen compositie met warme zandkleuren, rustige fotografie, seriftypografie en sober lijnwerk.

De gebruikte sfeerfoto’s worden geladen van Unsplash; lettertypen van Google Fonts. Deze externe verzoeken kunnen in productie worden vervangen door eigen lokaal gehoste bestanden. De foto’s tonen geen portret van Veronique en zijn geen afbeeldingen van de echte praktijk. Alle demo-behandelingen, prijzen en berichten zijn illustratief en moeten door eigen inhoud worden vervangen. Er worden geen medische dossiers of patiëntgegevens bijgehouden.

## Verificatiegrenzen

De build en validatietests controleren de frontend. Echte login, CRUD en databasebeveiliging moeten na installatie van het schema met een beheeraccount worden gecontroleerd. SQL-tests staan in `supabase/tests/access.sql`; voer ze uit met de Supabase CLI en pgTAP in een ontwikkelomgeving. Browsercontroles in de voorbeeldomgeving bewijzen geen rechten in de echte Supabase-database.
