# TEAM-81 + configurable widget + chat: vahid icra bələdçisi

6 noyabr 2026. Bu sənəd əvvəlki ayrı planların yerinə istifadə ediləcək vahid ardıcıllıqdır. Plan hazırlanıb; implementasiya edilməyib, testlər işə salınmayıb və Jira dəyişdirilməyib.

## 1. Məhsulun məqsədi və Jira-dakı faktiki scope

Game developer SDK-nı oyununa import edir, oyunçunun tokenini alma funksiyasını və dizayn konfiqurasiyasını verir, hazır UI-ni yerləşdirir. SDK öz düymələrini və backend çağırışlarını özü idarə edir. Developer ayrıca clan/chat frontend yazmır.

TEAM-81 epiki: SDK clan panel (clan-sdk).

| Faktiki Jira taskı | Faktiki acceptance criteria |
|---|---|
| [TEAM-103](https://nuraymuxtarli67.atlassian.net/browse/TEAM-103): core client for the social service | Plain JavaScript init({socialUrl,getPlayerToken}); listClans/createClan/joinClan/myClan/clanMembers. Hər çağırışda Bearer token; 401-də bir yeni token və retry; code/message olan API error; secret API key yoxdur. |
| [TEAM-104](https://nuraymuxtarli67.atlassian.net/browse/TEAM-104): no-clan panel | List və Join, Create form; full clan üçün Join disabled; name validation və server error; create/join-dan sonra my-clan view; mətn textContent ilə, innerHTML olmadan. |
| [TEAM-105](https://nuraymuxtarli67.atlassian.net/browse/TEAM-105): my clan and members | Clan adı və oyunçunun rolu; current player-in işarələndiyi members list; refresh button və ya polling. |

Oxunma vaxtında bu üç taskın statusu Yapılacaklar idi. Epikin birbaşa uşaqları üçün nəticə tamdır: üç issue, əlavə səhifə yoxdur. Chat, config loader, upload və tam manage ekranları bu epikdə mövcud task kimi görünmür. Aşağıdakı S-* adları yalnız plan addımlarıdır, yaradılmış Jira key-ləri deyil.

TEAM-81-in bitməsi chat məhsulunun da bitməsi demək deyil. Komandanın review/merge/integration Definition of Done-u varsa ona əməl et. Mockla keçən test real CORS və backend uyğunluğunun sübutu deyil.

## 2. Konfiqurasiyanı necə ayırırıq?

İstinad prototiplər: [chat editor](https://clan-widget-studio-nuray.uniqueoats2.chatgpt.site/), [all screens](https://clan-widget-studio-nuray.uniqueoats2.chatgpt.site/studio), [rules/guide](https://clan-widget-studio-nuray.uniqueoats2.chatgpt.site/clans).

Chat JSON schemaVersion:1-dir. Clan screens export isə kind:clan-experience-design-proposal/version:1-dir. Bunlar eyni backend schema-sı deyil. Birini digərinin içərisinə səssizcə qatmaq olmaz. SDK daxilində ayrı validator/adapter ilə dəstəkləmək olar. Mövcud backend persistence formatını dəyişmək ayrıca razılaşmadır.

İlkin chat config:

```json
{
  "schemaVersion": 1,
  "layout": {"mode":"floating","position":"bottom-right","width":380,"height":520},
  "theme": {"primaryColor":"#8B65EE","backgroundColor":"#171923","textColor":"#F4F4F9","borderRadius":14},
  "tabs": [{"id":"chats","label":"Chats","icon":"message-circle","enabled":true,"order":0}]
}
```

İlkin SDK qərarı: yalnız floating chat, dörd künc, bir enabled chats tab. Disabled invites/members saxlanıla bilər; aktiv, dəstəklənməyən tab aydın capability xətası verir. Default-lar yuxarıdakı dəyərlərdir; schemaVersion məcburidir. Bu SDK MVP məhdudiyyətidir, bütün platforma üçün yeni backend qaydası deyil.

Clan panelində discover/create/home/members istifadə edilir. Invitations/manage, tag/description persistence, emblem upload, roles editing və ownership transfer bu ilk scope-a daxil deyil. Clan name/member count/player role runtime response-dan gəlir. Prototipdəki sample clan adı və sayları config-in production məlumatına çevrilməməlidir. Editor canvas rəngi host oyunun fonunu dəyişməməlidir.

## 3. Ardıcıllıq

| Sıra | Addım | Asılılıq | Nəticə |
|---|---|---|---|
| 0 | S-00 Repository və contract xəritəsi | yoxdur | Uydurulmamış DTO və inteqrasiya siyahısı |
| 1 | TEAM-103 Social client | S-00 | UI-dən müstəqil client və mock fetch testləri |
| 2 | S-02 Config adapter/validation | S-00 | Ayrı chat və clan config dəstəyi |
| 3 | S-03 Mount/update/destroy | 1,2 | Oyuna yerləşən SDK shell |
| 4 | S-04 Config-driven renderer | 2,3 | JSON-a uyğun UI blokları |
| 5 | TEAM-105 My clan/members | 1,3,4 | Create/join sonrası göstəriləcək işlək view |
| 6 | TEAM-104 No-clan panel | 1,4,5 | List/create/join və avtomatik view keçidi |
| 7 | S-07 Paket və clan demo | 1–6 | TEAM-81-in birlikdə yoxlanması |
| 8 | S-08 Chat UI | 2–4 | Hazır mesajlaşma görünüşü |
| 9 | S-09 Fake chat transport | 8 | Backend olmadan işləyən chat demo |
| 10 | S-10 Real Social/chat inteqrasiyası | müqavilələr və backend | Real browser yoxlaması |
| 11 | S-11 Published config loader | Platform müqaviləsi | Config object əvəzinə published config yükləmə |

TEAM-105-i TEAM-104-dən əvvəl qururuq ki, create/join sonrası keçiləcək ekran artıq işləsin. Issue nömrələri implementasiya asılılığını müəyyən etmir. S-10-u Social və chat inteqrasiyası olaraq ayrı review-lara bölmək olar; real Social hazırdırsa chat-i gözləmək lazım deyil. S-11 müstəqil config object ilə demo qurulmasını bloklamır.

## 4. Codex ilə iş qaydası

Yeni sessiyanın əvvəlində aşağıdakı ümumi promptu ver. Sonra yalnız bir addımın promptunu və həmin addımın acceptance criteria-sını göndər. Backend/shared config source başqa repository-dədirsə Codex-ə onu oxuma imkanı ver və ya uyğun contract faylını təqdim et. Saytın görünüşü DTO müqaviləsi deyil.

```text
We are implementing a browser SDK that includes ready-made configurable clan and chat UI. The game developer only imports the SDK, supplies configuration and a player-token callback, and mounts the UI. SDK-owned controls call the SDK-owned clients internally.

Implement ONLY the requested step. First inspect repository instructions, existing tooling, components, config exports and available backend contracts. Keep the SDK in plain JavaScript ES modules and use safe DOM APIs, including textContent for text; do not use innerHTML for player/config/server content. Do not rewrite the dashboard or migrate unrelated code.

Maintain one compatible init({socialUrl,getPlayerToken,...}) client API as capabilities are added. Separate Social HTTP, config adapters, DOM UI and chat transport. Never require a secret game API key in browser code. Do not implement player registration or invent backend endpoints, DTO fields, WS event envelopes or config publishing APIs.

Put unresolved contracts in docs/integration-gaps.md. Provisional fixtures belong in tests or an explicit demo-only adapter; production SDK code must never silently select mocks. Distinguish preview/design defaults from authoritative runtime clan/player data and server permissions.

Run relevant tests and build if available. Finish with changed files, actual command results, manual verification steps and unresolved contracts. Do not claim tests passed if they were not run. Do not update Jira or implement later steps automatically.
```

### SDK integration forması

S-03-də aşağıdakı kimi API təklif edilir; repository-də mövcud uyğun API varsa onu qorumaq olar. Bunlar mövcud backend endpoint-ləri deyil.

```js
const sdk = init({socialUrl, getPlayerToken});
const clanPanel = sdk.mountClanPanel({container: clanRoot, config: clanDesign});
// Chat capability əlavə ediləndə:
const chatWidget = sdk.mountChatWidget({container: chatRoot, config: chatConfig});
clanPanel.updateConfig(nextClanDesign);
clanPanel.destroy();
```

Game developer createClan/joinClan düymələrini ayrıca bağlamır. İki mount metodu iki ayrı config formatının qarışmasının qarşısını alır; eyni SDK paketində qalırlar. Chat channel resolution və current-player identity üçün yalnız müqavilədə təsdiqlənmiş runtime məlumatları əlavə edilir. Host-dan gələn ID UI-də markalama üçündür, server authorization mənbəyi deyil.

## S-00 — Repository və contract xəritəsi

Acceptance criteria:
- Mövcud repo/scripts və hansı mənbələrin həqiqətən oxunduğu sənədləşdirilir.
- Config formatları və hər endpoint-in request/response/error məlumatları xəritələnir.
- No-clan cavabı, capacity göstəriciləri, current player ID/role və refresh-token davranışındakı boşluqlar qeyd edilir.
- WS URL, channel, auth, ack, message IDs, history, replay/refetch qərarları ayrıca siyahılanır.
- Uyğun sadə folder strukturu təklif olunur; mövcud repo varsa səbəbsiz yenisi yaradılmır.

```text
Implement S-00: inspect this repository and available contracts. Create docs/sdk-contract-map.md and docs/integration-gaps.md. Map TEAM-103, TEAM-104 and TEAM-105 requirements to existing code/contracts. Identify chat schemaVersion=1 and clan-experience-design-proposal/version=1 config support separately. For missing Social response shapes, no-clan semantics, capacity, current-player identity/role and WS details, record exact unknowns rather than guessing. Provide a minimal implementation structure and commands available in this repo. Do not implement feature code in this step. Missing remote sources should be documented; do not block local planning unnecessarily.
```

Yoxlama: sənəddə endpoint, response və çatışmayan contract sahələrini aç. Komanda üzvlərinə yalnız həmin dəqiq boşluqları soruş. Bu addım Jira feature taskını tamamlamır.

## 1 — TEAM-103: Social HTTP client

Acceptance criteria:
- init({socialUrl,getPlayerToken}) config-i yoxlayır, network çağırmır.
- listClans/createClan/joinClan/myClan/clanMembers hamısı shared request istifadə edir.
- Hər attempt Bearer token alır; 401-də bir dəfə yeni tokenlə retry, ən çox iki HTTP attempt.
- 404/409/network failure avtomatik retry olunmur.
- ApiError status/code/message saxlayır; successful JSON transform olunmur.
- Token callback failure, boş uğurlu response və qeyri-JSON error üçün anlaşılan davranış var.
- Secret game API key yoxdur; mock SDK production kodunda deyil.

```text
Implement TEAM-103: plain JavaScript ES-module Social client.

Expose init({socialUrl,getPlayerToken}) returning:
listClans({q}={}) -> GET /api/v1/clans with optional encoded q
createClan({name}) -> POST /api/v1/clans with JSON {name}
joinClan(clanId) -> POST /api/v1/clans/{encodedClanId}/join
myClan() -> GET /api/v1/players/me/clan
clanMembers(clanId) -> GET /api/v1/clans/{encodedClanId}/members

Use one shared HTTP handler for URL joining, Bearer auth, body serialization, response parsing and ApiError. init makes no network request. On the first 401 call getPlayerToken again and retry once; preserve the method and body. Do not retry other HTTP errors or network failures. Return backend JSON unchanged and retain API status/code/message on errors. Handle empty success and non-JSON error responses usefully. Keep player registration separate and leave room for later mount methods without introducing another init API.

Use Node's built-in tests and a recording fake fetch; restore global fetch after each test. Test all five successes with exact URL/method/header/body/result; encoded query/IDs; old-token/401 then new-token/success; two 401 responses with exactly two attempts; 409 clan_full; myClan 404 preserved as an error; network failure; token callback failure; invalid init. Document provisional response envelopes. Add README usage and npm test. Implement no UI yet.
```

Yoxlama:
1. Codex-in göstərdiyi SDK qovluğunda npm test işlə.
2. Testdə 401→200 ssenarisində callback sayının 2 və ikinci header-in yeni token olduğunu yoxla.
3. 409 ssenarisində fetch sayının 1 olduğunu yoxla.
4. README-də beş nümunəni aç; mock data-nın src daxilində olmadığını yoxla.

Bitmə: acceptance criteria və testlər keçib review qaydası yerinə yetirilibsə TEAM-103 üçün hazır deyə bilərsən. Real Social ilə yoxlanmadığını ayrıca qeyd et. UI gözləməyə ehtiyac yoxdur.

## 2 — S-02: Config adapter və validation

Acceptance criteria:
- Chat config-i və clan proposal ayrı tanınır; naməlum version aydın ConfigError verir.
- Chat default-ları, theme/layout və tabs saxlanır; unsupported active tab capability xətası verir.
- Clan proposal-da discover/create/home/members section-ları, copy, order, visibility və theme map edilir; invites/manage initial MVP-də unsupported capability kimi bildirilir, schema tam uyğun gəlir iddiası edilmir.
- Yanlış rəng/ölçü, duplicate ID və required section-un gizlədilməsi field path ilə rədd edilir.
- Original config mutate olunmur; arbitrary code/actions/HTML işlədilmir.
- Backend storage schema-sı dəyişdirilmir; UI-dəki sample runtime məlumatları ayrıca placeholder sayılır.

```text
Implement S-02: separate validators/adapters for the existing chat schemaVersion=1 config and the clan-experience-design-proposal version=1 design export. Use actual repository export samples if available. Support the documented initial Chats-only floating subset and the discover/create/home/members clan subset. Preserve source format recognition separately from supported capabilities; never silently claim unsupported screens/actions work.

Create an internal render model with field mapping, defaults, required-section rules, icon/action allowlists and useful ConfigError field paths. Validate finite dimensions, colors, corner positions, versions and duplicate IDs. Do not mutate inputs or change the backend schema. Separate runtime placeholders and editor canvas metadata from actual player data/host styles. Test valid configs, defaults, invalid fields, unsupported versions, capabilities and hidden required sections. No DOM UI yet.
```

Yoxlama: npm test; accent rəngini dəyişən və unsupported schemaVersion verən unit testləri aç. Hər formatın fixture-sini validator-a ver. Clan JSON-un olmaması chat JSON-un clan config-i kimi qəbul edilməsinə səbəb olmamalıdır.

## 3 — S-03: Mount, update və destroy

Acceptance criteria:
- Bir SDK client-i clan və chat widget mount-ları üçün genişlənə bilir; ilkin shell-lər backend success iddia etmir.
- Container və config validation var; eyni container üçün ikinci active mount qaydası aydındır.
- DOM textContent ilə yaradılır; Shadow DOM və ya testlə sübut olunan izolasiya var.
- İki instance state/config paylaşmır; kiçik viewport-a sığır.
- updateConfig invalid config-i atomik rədd edir; destroy idempotentdir və stale response UI-yə təsir etmir.

```text
Implement S-03 on the existing init client: mountClanPanel({container,config}) and mountChatWidget({container,config}) with separate config adapters. Return handles with updateConfig and destroy. Implement only minimal shells for now. Keep clan panel inline in its container initially and apply chat floating placement from its own layout config. Do not add a clan layout field to the chat backend schema.

Use safe vanilla DOM and isolate styles, preferably with Shadow DOM. Validate containers, prevent accidental double-mount, support independent instances, bound dimensions to small viewports, make config updates atomic and destroy idempotent. Remove only SDK-owned content/listeners; ignore late work after destruction. Avoid DOM access at module import. Add browser tests for placement, two instances, hostile host CSS, invalid updates, destroy and remount. Do not invent chat transport settings.
```

Yoxlama: browser test komandasını işlə; host səhifədə iki fərqli rəngli shell aç; birini destroy et; digəri qalsın; mobile viewport-da səhifənin kənarına daşmasın.

## 4 — S-04: JSON-dan UI renderer

Acceptance criteria:
- Shared/per-screen theme, typography, spacing, width və supported overrides işləyir.
- Section copy/order/visibility tətbiq olunur; required form hissələri qorunur.
- Config sample clan adı/count/role authoritative data kimi göstərilmir.
- İstənilən config mətni textContent ilə göstərilir; arbitrary action string icra edilmir.
- Appearance update draft və focus-u lazımsız silmir.

```text
Implement S-04: reusable safe-DOM renderers for the supported clan screen sections and chat visual shell. Apply themes, screen width/padding/alignment/typography, labels, supported icons, visibility and section order from normalized configuration. Keep editor-only metadata out of the host page. Map actions through explicit supported IDs rather than executing config text. Distinguish static copy/placeholders from runtime clan/player content. Add browser assertions for computed styles, labels, ordering, visibility, safe text, responsiveness and draft/focus preservation during appearance updates. Business HTTP actions belong to the next tasks.
```

Yoxlama: background/radius/label dəyiş; updateConfig çağır; görünüş dəyişsin. Clan name input-a yazıb theme dəyiş; input qalsın. Mətnə HTML-ə oxşar string ver; markup işləməsin.

## 5 — TEAM-105: My clan və Members

Bu addım TEAM-104-dən əvvəl qurulur, çünki create/join sonrası işləyən view lazımdır.

Acceptance criteria — Jira:
- Clan adı və oyunçunun rolu görünür.
- Members list-də current player işarələnir.
- Refresh button və ya polling siyahını yeniləyir. İlkin versiyada sadə Refresh button seçilir.

Əlavə yoxlamalar:
- myClan və clanMembers real client vasitəsilə çağırılır; role/player ID qaynağı təsdiqlənmiş contract-dan gəlir.
- Current-player identity yoxdursa ilk üzv və ya token mətnindən təxmin edilmir; müqavilə boşluğu qeyd edilir. Host-provided UI identity hint server icazəsi vermir.
- Refresh-də loading/error və stale-response handling var.
- myClan 404 HTTP client-də xəta qalır. UI-də no-clan qərarı yalnız razılaşdırılmış semantics və ya açıq provisional demo adapter-i ilə verilir.

```text
Implement TEAM-105 using the existing mounted clan panel and Social client. Show the current clan name and authenticated player's role; render members and mark the current player. Use an explicit Refresh button to reload relevant data instead of adding polling initially.

Identify the agreed sources of current-player identity and role from repository contracts. If absent, document the gap and use clearly provisional test/demo fixtures; do not guess identity, silently decode/assume token claims, or claim real-contract completion. Keep ApiError 404 unchanged in the client and isolate no-clan interpretation in a documented UI adapter.

Test actual panel rendering with mocked fetch: correct clan/role, current player marker, refresh after changed responses, empty members, errors, missing identity, delayed responses and destroy. All text must use textContent. Leave stable navigation/state transitions ready for TEAM-104. Add a minimal local browser harness if needed to test this task; final packaging is later.
```

Yoxlama:
1. Mock current player p1, role member və clan Dragons ver.
2. UI Dragons və member göstərsin; p1 sətrində You/Sən markeri olsun.
3. Mock members cavabını dəyiş, Refresh bas; yeni üzv görünsün.
4. 500/network error-da UI xəta göstərsin; əvvəlki üzvləri saxta yenilənmiş kimi təqdim etməsin.

Bitmə: üç Jira criteria-sı testlə sübut olunmalıdır. Identity/role contract hələ yoxdursa mockla hazır hissəni bildir, real inteqrasiyanı təsdiqlənmiş kimi təqdim etmə.

## 6 — TEAM-104: No-clan list, create və join

Acceptance criteria — Jira:
- Full clans üçün Join disabled.
- Create form name validation və server error göstərir.
- Create/join sonrası panel my-clan view-yə keçir.
- Text textContent ilə göstərilir, innerHTML yoxdur.

Əlavə yoxlamalar:
- Capacity indicator/memberCount/maxMembers mənbəyi agreed contract-a uyğun adapterdədir. Capacity məlum deyilsə full deyil iddiası edilmir; server final authority-dir.
- Create POST ilkin müqavilədə yalnız {name}; extra sahələr saxlanmış kimi göstərilmir.
- Loading/empty/network/API error halları və double-click qoruması var.
- Listdə yer olsa da join zamanı 409 clan_full gələ bilər və idarə edilir.
- Search q optional; gecikmiş nəticə yeni axtarışı əvəz etmir.

```text
Implement TEAM-104 using the Social client, config-driven renderers and the existing TEAM-105 my-clan view. Render a no-clan list with Join buttons and a Create Clan form. Disable Join for full clans according to the documented response adapter; keep server-side capacity validation authoritative. Validate names using the agreed contract; explicitly document provisional limits if unavailable.

Send only agreed create fields, initially {name}. Prevent duplicate submissions. Display server errors and preserve failed form input. After successful create or join, reload the relevant clan state and switch to the implemented my-clan view without host developer wiring. If the write succeeds but reload fails, do not automatically repeat the write; show a useful refresh error.

Render all strings with textContent, never innerHTML. Test list success/empty/error, full-clan disabled button with no POST, invalid name with no POST, create success, join success, 409 after a previously available clan, input preservation, double click, safe rendering and automatic view transition. Isolate unconfirmed no-clan/response semantics as documented test/demo adapters. Do not add invitations, uploads or manage-clan endpoints.
```

Yoxlama:
1. No-clan demo aç; bir clan dolu, biri boş olsun.
2. Dolu clanda Join disabled, click-dən sonra HTTP request yoxdur.
3. Boş name submit edəndə request getmir.
4. Dragons yarat; POST body və avtomatik My clan keçidini yoxla.
5. Başqa demo state-də Join bas; həmin view keçsin.
6. 409 error ver; inline error görünsün. HTML string mətn kimi görünsün.

Bitmə: Jira-nın dörd kriteriyası və view integration testləri keçməlidir. TEAM-104+105 üçün UI screenshot/video faydalı review sübutudur; yalnız unit test kifayət deyil.

## 7 — S-07: SDK build və müstəqil clan demo

Acceptance criteria:
- Dashboard runtime tələb olunmur; host built SDK-nı import edir.
- Host developer yalnız init/config/mount edir; öz Create/Join handler-lərini yazmır.
- Demo-only HTTP mock success/401/409/404/network hallarını simulyasiya edir; production package mock import etmir.
- Config dəyişir, lifecycle və clan journey browserdə yoxlanır; README exact commands göstərir.

```text
Implement S-07: package/build the existing SDK and create a separate host-page clan demo that imports the built package. Demonstrate initialization, mounting, configuration changes, refresh, destroy and remount. Keep all fake fetch behavior and provisional fixtures in an explicit demo/test adapter outside the production entrypoint.

Provide scenarios for no-clan, in-clan, full clan, expired token, server error and network failure. Add browser tests spanning list/create/join -> my clan -> members -> refresh. Document exact install/test/build/demo commands and a game-developer snippet that performs no per-button wiring. Verify TEAM-103/104/105 acceptance coverage and list any remaining real-backend gaps rather than claiming the epic is integrated automatically.
```

Yoxlama: göstərilən komanda ilə demo aç; aşağıdakı yekun clan checklist-ini işlə. Build artifact-i ayrı host səhifədə işləməlidir, dashboard server-i bağlı olsa da.

## 8 — S-08: Hazır chat UI

Acceptance criteria:
- Verilmiş chat config ilə floating widget, header, Chats tab, message list, composer var.
- Optional runtime title yoxdursa neutral başlıqdır, saxta clan/count yoxdur.
- Blank send bloklanır; messages təhlükəsiz mətn kimi render olunur; input keyboard/mobile əlçatandır.
- Loading/empty/disconnected/error görünüşləri var. Backend yoxdursa connected iddia etmir.

```text
Implement S-08: ready-made chat UI in mountChatWidget using the schemaVersion=1 config. Build the configured Chats tab, neutral/runtime header, scrollable message list, composer and Send button. Apply floating position, theme and bounded dimensions. Use safe textContent rendering and accessible controls. Reject whitespace-only messages and preserve draft/focus on theme updates. Define internal view-state hooks without inventing backend DTOs. Add browser tests for appearance, empty send, safe text, mobile layout and state feedback. Sample messages may exist only in tests/demo. Do not implement invitations, member tab or real sockets yet.
```

Yoxlama: chat JSON-la mount; rəngi və position-u dəyiş; boş Send bloklansın; mobile input görünən qalsın. Mesaj göndərmək bu taskda real backend əməliyyatı deyil.

## 9 — S-09: Chat transport və mock demo

Acceptance criteria:
- connect/loadHistory/sendMessage/subscribe/disconnect ekvivalentləri olan daxili transport sərhədi var.
- Game developer send handler bağlamır; UI özü transport çağırır.
- History, incoming, failure və dedup işləyir; server message ID və correlation davranışı provisional internal modeldə sənədləşir.
- Destroy subscription/connection-u təmizləyir, late result təsirsiz qalır.
- Fake transport yalnız explicit demo/test wiring ilə aktivdir; default production fallback deyil.

```text
Implement S-09: an internal chat transport interface and a controllable fake transport for tests/demo. Connect the real SDK chat UI to history, send and incoming events automatically. Separate the internal message view model from future backend DTOs. Define stable IDs/correlation in fixtures and test deduplication, including send acknowledgement vs incoming delivery.

Handle load/send failures, disconnected state, draft preservation, stale history and teardown. Keep fake transport out of the production package entrypoint and use an explicitly separated demo composition layer. Production should report unavailable transport when no real adapter exists. Extend the separate host demo with two themes and selectable chat scenarios. Test actual UI with fake transport, not a mocked widget implementation. Do not invent WS URLs, events, retries or token-renewal protocol.
```

Yoxlama: tarixçə yüklə; mesaj göndər; fake incoming əlavə et; eyni ID-ni iki dəfə göndər və bir dəfə görünməsini yoxla; send failure-da draft qalsın; destroy sonrası incoming UI yaratmasın.

## 10 — S-10: Real integration

Acceptance criteria:
- Social DTO/no-clan/capacity/player-role identity confirmed; provisional adapters real shapes-ə uyğunlaşdırılıb.
- Browser trusted backend-dən player token alır; secret game API key browser-a çıxmır.
- WS URL/auth/channel/history/send/ack/reconnect müqaviləsi təsdiqlənib; real adapter onu izləyir.
- Real Social ayrıca origin-də yoxlanır; HTTP CORS və WS Origin/auth davranışı uyğun olaraq test edilir.
- İki real session mesajlaşır; expiry/disconnect və duplicate handling yoxlanır.

```text
Implement S-10 against available, agreed contracts. Treat Social integration and chat integration as separate deliverables: complete whichever backend is ready without claiming the other is done. Verify actual response shapes, no-clan semantics, capacity, current-player identity/role and trusted player-token acquisition. Update adapters without changing the five-method public API.

Implement real chat transport only when URL/auth/channel/history/send/ack/message-ID/reconnect contracts exist. Follow the agreed replay/refetch and token rules; bound reconnect attempts and clean up on destroy. Never substitute mocks when real mode fails. Run cross-origin browser integration and two-player messaging where available. Report exact real checks separately from mocked checks, and list blocked contracts precisely. Do not invent missing endpoints or claim CORS is verified with a mock.
```

Yoxlama: mocks off; Create/Join/My clan/Members real cavabla; ikinci browser session-da chat; connection offline/online; expired token. Backend yoxdursa fake demo nəticəsi integration done deyil.

## 11 — S-11: Published config loader

Acceptance criteria:
- Platform endpoint/auth/game identifier/version/cache contract məlumdur.
- SDK published config alır, doğrulayır, render edir; draft production-da yüklənmir.
- Direct config object API qalır; invalid config/network üçün aydın davranış var.
- Social Bearer token-i razılaşdırılmamış Platform origin-inə sızmır.

```text
Implement S-11 only after the Platform published-config API contract exists. Add a loader with agreed game/project identifier, authentication, published version envelope and cache/update behavior. Preserve direct-object mounting and the separate chat/clan config adapters. Validate before applying config; retain the current working UI on invalid updates. Test published vs draft, invalid version, network failure and authorization boundaries. Do not invent the Platform endpoint or add config persistence to Social.
```

Yoxlama: dashboard publish → SDK documented load → widget yenilənir; yalnız draft dəyişəndə production görünüş dəyişmir. Dashboard publish hələ prototipdirsə bu axın hazır sayılmır.

## 5. Hər addımdan sonra Codex-dən tələb edilən yoxlama hesabatı

```text
Before I move to the next step, verify this completed step against every acceptance criterion. Report implemented, failed or blocked for each criterion with concrete evidence. Run the relevant existing tests and build once; fix failures caused by this step. Provide exact commands and a short manual demo procedure. Separate mocked verification from real backend verification. Do not implement the next step and do not change Jira status.
```

Komandalar repo-da script kimi mövcud olmalıdır. İlk addımlarda npm test əsasdır; UI işlərində məsələn npm run test:browser, npm run build, npm run demo script-ləri seçilə bilər. Codex faktiki yaratdığı adları README-də göstərsin; bu adların əvvəlcədən mövcud olduğu fərz edilmir. Mövcud dependency və lockfile varsa ona uyğun install et; package-lock olan repoda npm ci uyğun ola bilər. Hər addım üçün ayrıca branch/PR və ya review oluna bilən commit saxla. Codex Git commit/PR yaratmasa da sən dəyişiklikləri yoxlayıb normal komanda qaydasına uyğun təqdim edə bilərsən.

## 6. TEAM-81 üçün yekun manual checklist

| Ssenari | Gözlənilən nəticə |
|---|---|
| SDK init | Network getmir; invalid config aydın xəta verir |
| No-clan | Contract-a uyğun no-clan halında clan list və create görünür |
| Full clan | Join disabled; click request göndərmir |
| Create invalid name | Validation görünür; POST getmir |
| Create success | Bir POST; my-clan view açılır |
| Join success | Bir POST; my-clan view açılır |
| 409 clan_full | Inline error; extra avtomatik retry yoxdur |
| 401→success | İkinci attempt yeni Bearer token istifadə edir |
| 401→401 | İki attempt-dən sonra caller/UI error alır |
| My clan | Clan adı və doğru player role görünür |
| Members | Current player doğru sətrdə işarələnir |
| Refresh | Dəyişmiş members yenilənir |
| Təhlükəsiz mətn | HTML-ə oxşar mətn icra edilmir |
| Config update | Görünüş dəyişir, lazımsız draft itkisi yoxdur |
| Destroy | Listener/subscription və gecikmiş response təsirsizdir |
| Separate host | Dashboard olmadan built SDK işləyir |

Mock state reset no-clan/in-clan ssenarilərini demo daxilində dəyişir; real backend-də leave/disband bu scope-da yazılmayıbsa test oyunçusu/fixture dəyiş. Scope xaricində endpoint əlavə etmə.

## 7. Nə vaxt komandaya nə deyirsən?

- TEAM-103: client və mock testlər hazır olduqda client implementation hazırdır deyirsən; real inteqrasiyanı ayrıca qeyd edirsən.
- TEAM-105: clan/role/current-player marker/refresh browser testləri keçəndə UI hissəsi hazırdır; identity contract boşluğu varsa açıq deyirsən.
- TEAM-104: full clan, validation, server error, create/join→my-clan və textContent kriteriyaları testlə keçəndə hazırdır.
- TEAM-81: üç ticket komandanın Done qaydasına görə qəbul edilib və birlikdə demo olunubsa epik üçün completion təklif edə bilərsən. Mock-only acceptance komandanın qaydasına uyğun deyilsə review/integration mərhələsində saxla.
- Chat və published-config tamamlanması TEAM-81-in faktiki üç taskının completion-u ilə eyni deyil. Onlar üçün bu sənəddəki S-08–11 scope-ları yeni task təklifləri ola bilər; avtomatik Jira taskı yaradılmayıb.

Komandaya yazılacaq nümunə (yalnız faktiki nəticəyə uyğunlaşdır):

> TEAM-103 client implementasiyası və mock fetch testləri hazırdır. TEAM-104/105 panelində list/create/join, my-clan, current-player marker və refresh axınları browser mock testləri ilə yoxlanılıb. SDK ayrıca host səhifədə işləyir. Real backend yoxlaması: [yerinə yetirilənlər]. Qalan contract/integration boşluqları: [dəqiq siyahı]. Chat ayrıca mərhələdir.

## 8. İlkin scope-dan sonra

Invites/members chat tabları, invitation accept/reject, manage clan, role editing, owner transfer, leave/disband, emblem upload və native game-engine bindings ayrıca tasklardır. Members siyahısı TEAM-105-də var, amma həmin siyahını chat tabında göstərmək ayrıca UI inteqrasiyasıdır. Bu sənəd onları işlək kimi göstərmir.
