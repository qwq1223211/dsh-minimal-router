# Changelog

All notable changes to `dsh-minimal-router`.
Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [1.21.1] 鈥?2026-11-08

**鎶婅繖涓€杞殑鏂版満鍒跺啓杩涜鏄庝功銆?* 绾枃妗ｏ紝涓嶆敼琛屼负銆?
### Added 鈥斺€?`docs/RUNTIME.md` 涓よ妭

| 灏忚妭 | 鍐呭 |
|---|---|
| **搂5.5 鑷姩妯″紡** | 妯″紡鏂囦欢銆佷袱濂楁彁绀鸿瘝锛?52 / 183 瀛楋紝閮?鈮?00锛夈€佸洓鏉＄害鏉燂紙璇诲潖鎸?manual銆? 绉掔紦瀛樸€佸彧鏀规彁绀恒€佸凡瀹氶樁娈典笉鍙楀奖鍝嶏級锛屼互鍙?鎻愮ず璇嶅湪缂撳瓨鍓嶇紑涔嬪悗锛屽垏妯″紡涓嶈Е鍙戦噸寤? |
| **搂5.6 UI 璇锋眰閫氶亾** | 寰界珷 鈫?`request.json` 鈫?`tools/pre-execute` 娑堣垂 鈫?`restrict()` 鈫?`request-result.json`锛涗负浠€涔堝繀椤绘槸 pre-execute锛堝敮涓€鎷垮緱鍒?`agent.ctx.tools` 鐨勪綅缃級锛涗笁鏉′繚鎶わ紙杩囨湡涓嶆墽琛?/ 鍚?id 鍙墽琛屼竴娆?/ 澶辫触鍐欏師鍥狅級 |

### Changed 鈥斺€?鏁版嵁鏂囦欢琛?
琛ヤ簡 5 涓法鎻掍欢鏂囦欢锛歚current.json`銆乣tool-registry.json`銆乣mode.json`銆乣request.json`銆乣request-result.json`锛?骞舵爣娉ㄦ瘡涓枃浠剁敱璋佸啓銆佷粈涔堟椂鍊欏啓銆?
**鍏ㄩ噺 399 椤归€氳繃**锛堟枃妗ｆ敼鍔ㄤ笉褰卞搷娴嬭瘯锛夈€?
## [1.21.0] 鈥?2026-11-08

**鑷姩妯″紡锛氳妯″瀷鑷繁鍐冲畾寮€鍝簺宸ュ叿缁勩€?*

### 鑳屾櫙

涔嬪墠"宸ュ叿琛ㄧ敱璋佸喅瀹?鏄浐瀹氱殑锛氶樁娈靛垏鎹㈡寜鍏抽敭璇嶃€佹敹绐勯潬浜烘墜鍔ㄧ偣銆?浣嗗緢澶氭椂鍊?*鍙湁妯″瀷鑷繁鐭ラ亾**涓嬩竴姝ラ渶涓嶉渶瑕?Unity 閭?26 涓伐鍏封€斺€?涓庡叾璁╁畠鎾炰竴娆?out-of-stage锛屼笉濡傛妸鍐冲畾鏉冪洿鎺ョ粰瀹冦€?
### Added 鈥斺€?妯″紡鏂囦欢 + 涓ゅ鎻愮ず璇?
鏂板 `~/.dsh/task-guard/mode.json`锛堢敱寰界珷寮€鍏冲啓鍏ワ紝璺敱鍣ㄨ鍙栵紝5 绉掔紦瀛橈級锛?
| 妯″紡 | 灏鹃儴鎻愮ず锛堚墹200 瀛楃‖涓婇檺锛?|
|---|---|
| `manual`锛堥粯璁わ級 | `[router] stage=auto (all tools available). 鈥all route_stage("unity-ui").`锛?52 瀛楋級 |
| `auto` | `[router] auto mode: YOU decide the tool set. Narrow it with route_use({groups:["unity"]}) for a few turns, or task_start({groups:[...]}) for a whole task. All tools are available now.`锛?83 瀛楋級 |

鑷姩妯″紡涓嬫ā鍨嬩細涓诲姩璋冪敤 `route_use`锛堟寜杞暟涓存椂鏀剁獎锛夋垨 `task_start`锛堜换鍔＄骇鏀剁獎锛夛紝
鑰屼笉鏄鍔ㄧ瓑浣犵偣鎸夐挳銆?*璇讳笉鍒版ā寮忔枃浠朵竴寰嬪綋 manual**鈥斺€斾繚瀹堬紝涓嶄細绐佺劧鎶婃帶鍒舵潈浜ゅ嚭鍘汇€?
### 璁捐鍙栬垗

- 妯″紡鏂囦欢鏀惧湪 `~/.dsh/task-guard/`锛岃**寰界珷锛堝啓锛夊拰璺敱鍣紙璇伙級鍏变韩鍚屼竴涓紑鍏?*锛屼笉闇€瑕?IPC銆?- 5 绉掔紦瀛橈細鍒囨崲妯″紡鍚庢渶澶?5 绉掔敓鏁堬紝閬垮厤姣忔璇锋眰閮借鐩樸€?- 鎻愮ず璇嶄粛鐒跺彈 200 瀛楃‖涓婇檺绾︽潫锛屼袱鐗堥兘瀹炴祴鏈埅鏂€?
### Tests

鏂板 `test/prompt.test.mjs`锛? 鏉★級锛氫袱鐗堟枃妗堜笉鍚屻€侀兘 鈮?00 瀛椼€侀兘鏄崟琛屻€佸凡瀹氶樁娈垫椂涓ゆā寮忎竴鑷淬€?
**鍏ㄩ噺 399 椤归€氳繃**锛?95 鈫?399锛夈€?
## [1.20.0] 鈥?2026-11-08

**鎺㈤拡寮€濮嬫寜闃舵绠楄处锛氱粓浜庤兘鍥炵瓟"杩欎釜闃舵鍒板簳鐪佷簡澶氬皯"銆?*

### Added 鈥斺€?`summarize()` 杈撳嚭 `byStage`

`cache_probe_report` 鐨?`summary` 閲屽浜?`byStage` 鏁扮粍锛屾瘡涓樁娈典竴琛岋細

| 瀛楁 | 鍚箟 |
|---|---|
| `stage` | 闃舵鍚嶏紙鏃ц褰曟病鏈?stage 鏃舵槸 `n/a`锛?|
| `count` | 璇ラ樁娈靛嚭鐜拌繃鐨勮姹傛暟 |
| `tools` / `toolsChars` | 璇ラ樁娈?*鏈€鍚庝竴娆?*鐨勫伐鍏疯〃澶у皬 |
| `promptTokens` / `cacheReadTokens` / `hitRate` | 璇ラ樁娈电殑缂撳瓨鍛戒腑锛堟寜 token 鍔犳潈锛?|

**鐪熸満鏁版嵁锛?25 鏉℃帰閽堣褰曪級**锛?
```
auto        288 娆?路 274 宸ュ叿 路 240,981 chars 路 鍛戒腑 98.84%
n/a         122 娆?路   0 宸ュ叿 路       2 chars 路 鍛戒腑 96.67%锛堟帴绾垮墠鐨勬棫璁板綍锛?unity-ui     15 娆?路 176 宸ュ叿 路 124,171 chars 路 鍛戒腑 93.51%
```

涓€鐪煎氨鑳界湅鍑猴細鍒囧埌 `unity-ui` 鍚庡伐鍏疯〃灏忎簡 **116,810 瀛楃锛堚垝48.5%锛?*銆?
### Added 鈥斺€?`_tools/claim-next.mjs`锛堜粨搴撳鐨勫伐鍏疯剼鏈級

璇诲畬鏁翠綋妫€鏁版嵁锛岀洿鎺ユ墦鍗?涓嬩竴涓璁ら璋?鍜屽彲绮樿创杩?`custom_stages.json` 鐨?JSON锛?`--write` 鍙洿鎺ュ啓鍏ワ紙鍏堝浠斤級銆傛暟鎹簮浼樺厛鐢?task-guard 鐨?`tool-registry.json`銆?
### 椤哄甫淇殑鍧?
- `task_end` 涔嬪悗鐨勫揩鐓т笉鍐嶄繚鐣欏伐鍏峰悕鍗?鈫?璁ら寤鸿娌′簡鏁版嵁婧愩€傜幇鍦?task-guard 鍦?`task_start`锛?*鍚?dryRun**锛夋椂鍐欎竴浠芥寔涔呯殑 `tool-registry.json`锛?39 涓伐鍏凤級锛屼换鍔＄粨鏉熶篃涓嶅垹銆?- 璁ら鑴氭湰涔嬪墠鍙粠"璋冪敤杩囩殑宸ュ叿"鎺ㄦ爣绛撅紝瀵艰嚧"姣忎釜鏍囩閮借鐢ㄨ繃"鐨勫亣缁撹锛涚幇鍦ㄦ敼鐢ㄥ叏閲忔竻鍗曠畻 `used/total`銆?
**鍏ㄩ噺 395 椤归€氳繃**锛?92 鈫?395锛屾柊澧?3 鏉?byStage 娴嬭瘯锛夈€?
## [1.19.9] 鈥?2026-11-07

**鎶婅繍琛屾椂鍙娴嬫€цˉ榻愩€? 椤规敼杩涳紝鍏ㄩ儴鏉ヨ嚜 2,809 鏉℃椿鍔ㄦ棩蹇?+ 21 涓巻鍙蹭細璇濈殑瀹炴祴銆?*

### P0 鈥斺€?璁╁凡鏈夋暟鎹彉寰楀彲鐢?
| 鏀硅繘 | 鏀瑰墠 | 鏀瑰悗 |
|---|---|---|
| 鎺㈤拡璁伴樁娈?| 17/17 鏉¤褰?`stage: "n/a"` | 鏂板 `lib/live.js`锛堜細璇濃啋闃舵鍏变韩琛級锛屾帰閽堟寜浼氳瘽鍝堝笇鏌ワ紱瀹炴祴鍙鍒?`unity-ui` |
| 鍒囨崲璁拌Е鍙戣瘝 | 鍙湁 `by:"keyword"` | 鏂板 `kw`锛堝懡涓殑璇嶏級+ `s`锛堜細璇濆搱甯岋級锛涙柊澧?`matchedKeyword()` |
| degrade 鍘婚噸 | 鍚屼竴鏉″師鍥犺鍐?287 娆★紙鍗犲叏閮ㄤ簨浠?10%锛?| 鎸?`(model, reason)` 姣忎釜杩涚▼鍙涓€娆?|

### P1 鈥斺€?鍑忓皯璇垽涓庤瀵?
- **`art` 璇嶈〃鍘绘帀瑁歌瘝 `model`**锛氬畠鍦ㄥ紑鍙戣澧冮噷澶父瑙侊紙"鏁版嵁妯″瀷"/"model 灞?锛夛紝涓€鍛戒腑灏卞垏缇庢湳闃舵 = 涓€娆″墠缂€閲嶅缓銆備腑鏂?妯″瀷"淇濈暀銆?- **鍒犻櫎 `estimatedAdvertised`**锛氬畠鎸?娉ㄥ唽鏁?鈭?deny"绠楋紝鍜岀湡瀹炲€煎樊 31 涓紙base/浣滅敤鍩熷伐鍏凤級锛岀暀鐫€鍙細璇銆傝鐪嬬湡瀹炴暟瀛楀彧鑳界敤鎺㈤拡銆?
### P2 鈥斺€?浣撻獙涓庢暣娲?
- **`route_status({ compact: true })`**锛氬畬鏁磋緭鍑虹害 4K token锛宑ompact 鍙洖 `stage/by/toolCount/restrictedToolCount/unionEnabled`銆?- **鎺㈤拡璺ㄨ疆杞鍙?*锛氬綋鍓嶆枃浠朵笉澶熸椂鑷姩璇?`usage.jsonl.1`锛堝疄娴?`.1` 閲屾湁 5,462 鏉°€?.1 MB 鍘嗗彶锛屽師鏉ュ畬鍏ㄨ涓嶅埌锛夛紱`count()` 鍚屾牱鍚堝苟銆?- **`lib/union.js` 鏍囪 `@deprecated`**锛氭寜 ROADMAP 鐨?鍏堝簾寮冦€佸悗鍒犻櫎"锛屼笅涓€鐗堝彲鍒狅紙杩炲甫涓や釜娴嬭瘯鏂囦欢锛夈€?
### 鏁版嵁渚濇嵁锛? 澶╁彴璐︼級

```
switch 313 娆★細auto鈫抋rt 289 / auto鈫抎ocument-write+python-code 24
  鍏朵腑 278 娆★紙89%锛夐泦涓湪 11 涓?5 鍒嗛挓绐楀彛 鈫?鍘嬫祴/瀹為獙锛屼笉鏄湡瀹炰娇鐢?deny   238 娆★細lint/write 66锛堝凡淇級銆乽nity_object_create 123銆乵eshy 41
degrade 287 娆★細鍏ㄦ槸鍚屼竴鍙?deepseek-v4-pro leading-only
```

**鍏ㄩ噺 392 椤归€氳繃**锛?82 鈫?392锛屾柊澧?`test/live.test.mjs` 9 鏉?+ compact 1 鏉★級銆?
## [1.19.8] 鈥?2026-11-07

**鎶婅繍琛岄€昏緫鍐欒繘璇存槑涔︺€?* 绾枃妗ｏ紝涓嶆敼琛屼负銆?
### Added 鈥斺€?`docs/RUNTIME.md`

鎸変唬鐮侀€愭鏍稿疄鐨勮繍琛屾椂鎵嬪唽锛屽洖绛?瀹冭繍琛屾椂鍒板簳鍋氫簡浠€涔堛€佷粈涔堥『搴?锛?
| 绔犺妭 | 鍐呭 |
|---|---|
| 鍚姩鏃?| `apply()` 鐨?7 姝ワ細閰嶇疆褰掍竴鍖?鈫?骞堕泦寮€鍏?鈫?闃舵琛ㄤ笁灞傚悎骞?鈫?Proxy 鍖呰 鈫?娉ㄥ唽 11 涓伐鍏?鈫?鎸?3 涓ā鍧?鈫?鎸?4 涓挬瀛?|
| 鐢ㄦ埛鍙戞秷鎭?| 鍥涢亾闂搁棬鐨?*浠ｇ爜椤哄簭**锛氫笂涓嬫枃锛?0 涓囷級鈫?鍥炴湰锛堚墹3 杞級鈫?杩熸粸锛? 娆＄‘璁?+ 60s锛夆啋 搴旂敤锛涗互鍙婂悇鑷殑渚嬪锛坄force:true`銆佹樉寮忓垏鎹級 |
| 姣忔宸ュ叿璋冪敤 | `pre-execute` 鐨?6 姝ワ細閫冪敓闂?鈫?浣跨敤鐢诲儚 鈫?浣撴 鈫?闃舵瓒婄晫 鈫?鍙嶉闂幆 鈫?寮傚父鏀捐 |
| 鍒ゅ畾椤哄簭 | `decideOutOfStage` 鐨?6 鏉¤鍒欙紝鍚?`auto` 涓嶈鍓?鏄?`stage === 'auto'` 鐗瑰垽锛?*涓嶆槸**"allow 涓虹┖"锛夎繖涓€鏄撻敊鐐?|
| 鏀剁獎钀藉湴 | 涓轰粈涔堝彧鐢?`deny` 涓嶇敤 `allow`锛坅llow 浼氶殣钘?`read`/`write`锛屽疄娴?4/4 浼氳瘽涓㈠け锛夛紝`run_code` 渚嬪锛屽け璐ュ嵆闄嶇骇 |
| 鏁版嵁鏂囦欢 | 4 涓枃浠剁殑鍐呭涓庡啓鍏ユ椂鏈?|
| 榛樿鍊艰〃 | 15 椤瑰叧閿厤缃殑榛樿鍊硷紙鍚?`enforceByRestrict` 浠撳簱榛樿 `false`銆佹湰鏈?profile 寮€ `true`锛?|
| 闄嶇骇璺緞 | 妯″潡鍔犺浇澶辫触 / restrict 涓嶅彲鐢?/ 妯″瀷涓嶆敮鎸?in-history / 閽╁瓙鎶涢敊 鈫?鍚勮嚜鐨勮〃鐜?|
| 涓変釜鍙ｅ緞 | `registeredToolCount` / `estimatedAdvertised` / 鎺㈤拡 `tools` 涓轰粈涔堝樊 31 涓紝鍋氬姣斿彧鐢ㄦ帰閽?|

### Changed

涓変釜 README 鐨?*棣栧睆**閮藉姞浜嗐€屽畠鎬庝箞璺戠殑锛堢畝鐗堬級銆嶏細涓や釜鍏ュ彛銆佸洓閬撻椄闂ㄣ€? 姝ュ垽瀹氥€佸畨鍏ㄧ綉锛屽苟閾惧埌 `docs/RUNTIME.md`銆?
### 椤哄甫鏇存涓€澶勮娉?
`task_*` 宸ュ叿**涓嶅湪** `ALWAYS_ALLOW` 閲屻€傚畠姘歌繙鍙敤鏄洜涓?*鏈棰嗘爣绛鹃粯璁ゆ斁琛?*锛坄decideOutOfStage` 绗?5 鏉★級锛?涓嶆槸閫冪敓闂ㄢ€斺€斾袱绉嶆満鍒舵晥鏋滅浉鍚屼絾鍘熷洜涓嶅悓锛岃鏄庝功閲屽凡缁忓啓娓呫€?
**鍏ㄩ噺 382 椤归€氳繃銆?*

## [1.19.7] 鈥?2026-11-07

**鎴愭湰妯″瀷鎸夌湡鏈哄疄娴嬫牎鍑嗭細涓€娆℃€ф敮鍑鸿鎸?鏀剁獎鍚?鐨勪笂涓嬫枃绠椼€?*

### 瀹炴祴锛堟柊浼氳瘽锛宎uto 鈫?unity-ui锛?
| 鎸囨爣 | 鍒囨崲鍓?| 鍒囨崲鍚?| 鍙樺寲 |
|---|---|---|---|
| 宸ュ叿鏁帮紙鎺㈤拡锛?| 270 | 172 | 鈭?8 |
| toolsChars | 237,350 | 120,540 | 鈭?16,810锛堚垝49.2%锛?|
| 姣忚疆鐪?| 鈥?| 鈥?| 鈮?鈭?5,043 token |
| 閲嶅缓瀹為檯鎴愭湰 | 鈥?| 60,045 | 鏃фā鍨嬮浼?97,189 |

鏃у叕寮?`costTokens = 涓婁笅鏂?脳 姣斾緥` 鍋囪閲嶅缓瑕佹妸**鏀剁獎鍓?*鐨勬暣娈甸噸鏂板彂涓€閬嶃€?浣嗛噸寤烘椂鍙戝嚭鍘荤殑灏辨槸**鏀剁獎鍚?*鐨勫伐鍏疯〃锛屽疄娴嬫垚鏈濂芥槸 `97,189 鈭?35,043 鈮?62,146`銆?
### Changed

`estimateSwitchEconomy()` 鐨勬垚鏈」鏀逛负 `max(0, 涓婁笅鏂?鈭?姣忚疆鐪佷笅) 脳 閲嶅缓姣斾緥`銆?鏁堟灉锛氬洖鏈疆鏁?**2.78 鈫?1.77**锛屼笌瀹炴祴鐨勭害 **1.7 杞?* 涓€鑷达紱
鍦ㄤ复鐣岀偣涓婁笉浼氬啀"楂樹及鎴愭湰 鈫?閿欒鎷掔粷鍒囨崲"銆?
椤哄甫鍔犱簡涓ゆ潯娴嬭瘯锛氱湡鏈烘牎鍑嗗€硷紙97,189 / 116,810 鈫?1.77锛変笌"鐪佷笅鐨勯噺 鈮?涓婁笅鏂?鐨勯槻鍛嗭紙鎴愭湰閽冲埌 0锛屼笉涓鸿礋锛夈€?
### Docs

`docs/LIMITS.md` 鏂板 搂鍏€屽垏鎹竴娆＄殑鐪熷疄鎴愭湰銆嶏紝鍚墠鍚庡姣旇〃銆佹ā鍨嬩慨姝ｈ鏄庯紝
浠ュ強 `estimatedAdvertised 141` 涓庢帰閽?`172` 宸?31 涓?base 宸ュ叿鐨勫彛寰勬彁閱掋€?
**鍏ㄩ噺 382 椤归€氳繃**锛?80 鈫?382锛夈€?
## [1.19.6] 鈥?2026-11-07

**淇竴涓湡璇嫤锛屽苟椤烘墜淇涓€涓垜涓婁竴杞紩鍏ョ殑鍥炲綊銆?*

### Fixed 鈥斺€?浣撴涓嶅啀鎷﹀唴瀹瑰瀷宸ュ叿锛堢湡鏈鸿瘉鎹細66 娆¤鎷︼級

`route_status` 鏃佽竟鐨勬椿鍔ㄦ棩蹇楋紙`activity.jsonl`锛夐噷锛?98 娆?`deny` 鍙湁 3 涓伐鍏凤細

| 宸ュ叿 | 娆℃暟 | 鏉ユ簮 | 鏄惁鍚堢悊 |
|---|---|---|---|
| unity_object_create | 99 | by=stage | 鉁?鍚堢悊锛堝湪 art/core 闃舵锛?|
| meshy_image_to_3d | 33 | by=stage | 鉁?鍚堢悊锛堝湪闈?art 闃舵锛?|
| **write** | **66** | **by=lint** | 鉂?**璇嫤** |

66 娆″叏閮ㄥ彂鐢熷湪 2026-10-31 鍚屼竴澶╋紝鍘熷洜锛歚write` / `edit` 鐨勫弬鏁板氨鏄?*鏂囦欢鍐呭**锛?鑰屼綋妫€鎶?鍐欏叆鍐呭閲岀殑寰幆"褰撴垚"鍗冲皢鎵ц鐨勬寰幆"銆傚啓涓€涓悎娉曠殑鏃犻檺寰幆
锛堟父鎴忎富寰幆銆佸畧鎶よ繘绋嬨€佷簨浠跺惊鐜級浼氳**鎷掔粷鍐欏叆**銆?
**鏀规硶锛堟柟妗?C锛?*锛氭妸鍐崇瓥浠?index.js 鎼繘 `lib/lint.js` 鐨勬柊鍑芥暟 `decideLint()`锛屾敮鎸佹寜宸ュ叿鍒嗙骇锛?
- 鍐呭鍨嬪伐鍏凤紙`write` / `edit`锛岃 `LINT_WARN_TOOLS`锛夆啋 鍙?`warn`锛岀収甯稿啓鍏?- 鎵ц鍨嬪伐鍏凤紙`pwsh` / `terminal` / `python`锛夆啋 浠嶇劧 `deny`锛堜繚鎶ゆ病涓級
- `skipTools` / `mode=off` 璇箟涓嶅彉

椤哄甫鐨勫ソ澶勶細鍐崇瓥鍙互鍗曟祴锛屼笉闇€瑕佽捣鎻掍欢锛沗index.js` **1197 鈫?1190锛堝噣鍑?7 琛岋級**銆?
### Fixed 鈥斺€?鎴戜笂涓€杞妸 tool-inventory 寮勬寕浜嗭紙鍥炲綊锛?
`_tools/manage-plugins.mjs` 缁?5 涓寘琛?`exports` 鏃讹紝鎶?`main: "index.js"` 鍘熸牱鍐欐垚
`exports["."] = "index.js"`銆侼ode 瑕佹眰浠?`./` 寮€澶达紝浜庢槸锛?
```
tool-inventory-v5: failed to import: Invalid "exports" main target "index.js"
```

**tool_inventory 鐨勪笁涓伐鍏峰洜姝ゅ姞杞藉け璐ャ€?* 宸蹭慨鍖呭唴 `exports` 涓?`"./index.js"`锛?骞跺湪鑴氭湰閲屽姞浜嗗綊涓€鍖栵紙涓嶄互 `./` 寮€澶村氨琛ヤ笂锛夛紝閬垮厤浠ュ悗鍐嶇姱銆?
### Tests

- 鏂板 `test/lint-decide.test.mjs`锛? 鏉★級锛歸rite/edit 鈫?warn銆乸wsh 鈫?deny銆佹湁 break 鏀捐銆乻kip/off/warn 妯″紡銆佺┖鍙傛暟
- `router.test.mjs` 鐨勬棫鏂█锛坵rite 琚嫤锛夋敼涓烘柊濂戠害锛屽苟鏂板涓€鏉?鍚屼竴娈典唬鐮佷氦缁?pwsh 浠嶈鎷?

**鍏ㄩ噺 380 椤归€氳繃**锛?70 鈫?380锛夈€?
## [1.19.5] 鈥?2026-10-31

**鐪熸満楠屾敹鎶撳埌鐨勮嚜杩濊淇銆?* v1.19.4 鐨勬柦宸ュ崟閲屽啓鐫€"byTag 涓嶅啓鍏?route_status 杈撳嚭"锛?鑰屽疄闄呭疄鐜版妸鏁翠釜 toolUsage 瀵硅薄鐩存帴鎶涗簡鍑哄幓锛宐yTag 璺熺潃婕忎簡 鈥斺€?瀹炴祴澶氬嚭 **41 鏉?*銆佺害 1.5KB銆?
### Fixed

index.js 鐨?toolUsage 杈撳嚭鏀逛负**鍓旈櫎 byTag** 鐨勫叕寮€瑙嗗浘锛?
    toolUsage: toolUsage && (({ byTag: _byTag, ...publicPart }) => publicPart)(toolUsage),

- byTag 浠嶄繚鐣欏湪灞€閮ㄥ父閲忛噷锛屼緵 findUnclaimed() 璁＄畻 used/total/verdict
- 瀵瑰杈撳嚭鍙繚鐣欏師鏈夊瓧娈碉紙trackedTools / unusedTools / unusedGroups / topUsed / advice锛?- index.js 浠嶆槸 **1197 琛?*锛堝噣 0 琛岋級
- usageTracking 鍏抽棴鏃?toolUsage 涓?null锛岃琛ㄨ揪寮忓悓鏍疯繑鍥?null

### 鐪熸満楠屾敹鏁版嵁锛坴1.19.4 棣栨涓婄嚎鏃跺彇寰楋級

| 鏍囩 | bytes | used/total | verdict |
|---|---|---|---|
| **ego** | **28,503**锛堟渶澶э級 | **2 / 35** | **do-not-claim** |
| comfyui | 8,661 | 1 / 4 | do-not-claim |
| route | 3,398 | 2 / 7 | do-not-claim |
| **screen** | 2,978 | 0 / 3 | **claim-candidate** |
| task | 2,026 | 3 / 3 | do-not-claim |
| sticker | 1,200 | 0 / 3 | claim-candidate |

**浣撶Н鏈€澶х殑 ego 鎭版伆鏄?鐢ㄨ繃鐨?**鈥斺€旇繖姝ｆ槸璁ら鍒ゆ嵁瀛樺湪鐨勬剰涔夛細鎸?璋佹渶澶у氨璁ら璋?鐨勮€佹€濊矾锛?浼氫竴鍒€鐮嶆帀姝ｅ湪鐢ㄧ殑宸ュ叿銆倀ask锛坱ask-guard 鑷繁鐨?3 涓伐鍏凤級鍏ㄩ儴鐢ㄨ繃锛屽悓鏍蜂竴涓兘涓嶈兘瑁併€?
鍚屾椂纭 route_status.unionEnabled === false 鍦ㄧ湡鏈哄彲瑙侊紙v1.19.2 鐨勯粯璁ゅ叧闂凡鐢熸晥锛夈€?
**鍏ㄩ噺 370 椤归€氳繃銆?*

## [1.19.4] 鈥?2026-10-31

**鎶?璁ら鍒ゆ嵁"浠庝竴鍙ヤ环鍊艰鍙樻垚涓€寮犺兘绠楃殑琛ㄣ€?* 榛樿鍔ㄤ綔鏄?*涓嶈棰?*銆?
### Added 鈥斺€?`unclaimedTags` 澶氫笁鍒楋細`used` / `total` / `verdict`

`route_status.unclaimedTags` 鐜板湪姣忛」鏄?`{ tag, count, bytes, used, total, verdict }`锛?
| verdict | 鍚箟 | 寤鸿 |
|---|---|---|
| `claim-candidate` | 璇ユ爣绛剧殑宸ュ叿**涓€涓兘娌¤璋冪敤杩?* | 鍊欓€夛紝浠嶉渶浜哄垽鏂鍩熶笓鐢ㄦ€?|
| `do-not-claim` | **鏈夊伐鍏风湡鐨勮璋冪敤杩?* | 缁濅笉璁ら锛堜細瑁佹帀鍦ㄧ敤鐨勶級 |
| `no-data` | 鐢ㄩ噺鐢诲儚閲屾煡涓嶅埌 | 璇佹嵁涓嶈冻锛屼笉鍔?|

鏁版嵁鏉ユ簮锛歚lib/usage.js` 鐨?`summarize()` 鏂板鍏ㄩ噺 `byTag`锛堜笉鎴柇銆佷笉杩囨护锛夛紱
`lib/stages-config.js` 鐨?`findUnclaimed()` 鍚堟垚涓夊垪骞剁粰鍒ゅ畾銆?`verdict` **涓嶉┍鍔ㄤ换浣曡鍓涓?*鈥斺€斿畠鍙槸缁欎汉鐪嬬殑涓€鍒椼€?
### Added 鈥斺€?`docs/CLAIMING.md`

鎶婅瘎瀹￠噷閭ｆ鍒ゆ柇钀芥垚鏂囦欢锛氫袱绉嶈处鏈紙澹版槑 vs 璋冪敤锛夈€佷笁鏉″噯鍏ャ€佷笁鏉℃嫆鍏ャ€?涓€涓畻寮忥紙`姣忚疆鐪?鈮?bytes 脳 0.25` / `鍥炴湰 = 涓婁笅鏂?/ 姣忚疆鐪乣锛夈€佷互鍙婇€傜敤鍩?锛堢煭浼氳瘽鍑犱箮蹇呯劧浜忥紱鍙湁闀夸細璇?+ 宸ㄥ瀷宸ュ叿琛ㄦ墠鍊煎緱锛夈€?
### Verified before coding锛堝紑宸ュ墠涓変欢鏍稿疄锛?
1. **`byTag` 鐨勬爣绛鹃泦鍚堣鐩?`unclaimedTags`**锛氱敤鐪熷疄 tracker 璺戜竴閬嶏紝鏈棰嗗垪琛ㄩ噷姣忎釜鏍囩閮借兘鍦?`byTag` 鏌ュ埌
   锛坄byTag` 棰濆鍚?`core` 涓庤璁ら鏍囩锛岄偅鏄?`findUnclaimed` 涓诲姩璺宠繃鐨勶紝涓嶆槸缂哄彛锛?2. **`summarize()` 鏃犲壇浣滅敤**锛氬嚱鏁颁綋鍐呮棤 `writeFile` / `appendFile` / `flush` / `dirty` 璧嬪€?鈫?`toolUsage` 涓婃彁瀹夊叏
3. **`byTag` 閬嶅巻鍏ㄩ儴 `names`銆佹棤杩囨护**锛氬疄娴嬭鐩?`core/ego/futureplug/unity`锛岃繃婊ゅ彧鍙戠敓鍦?`unusedGroups`

### Changed 鈥斺€?`index.js` 1198 鈫?**1197**锛堝噣鍑?1 琛岋級

鎶?`toolUsage` 涓婃彁涓哄眬閮ㄥ父閲忥紝`unclaimedTags` 涓?`toolUsage` 鍏辩敤鍚屼竴浠界敾鍍忥紝
鍘熸潵閭?3 琛屽唴鑱斾笁鍏冨帇鎴?1 琛?+ 1 琛屽紩鐢ㄣ€備粛鍦?1200 瀹堝崼绾垮唴銆?
### Tests

`test/infra.test.mjs` 15 鈫?**22 鏉?*锛屾柊澧?5 鏉￠拤姝昏棰嗗垽鎹紝澶栧姞 2 鏉℃湰杞牎鍑嗚ˉ鐨勶細
`claim-candidate` / `do-not-claim`锛堟渶閲嶈锛? `no-data`锛坄used` 蹇呴』鏄?`null` 涓嶆槸 `undefined`锛?
鎺掑簭涓嶅彈 verdict 褰卞搷 / `byTag` 瑕嗙洊鍏ㄩ噺涓?`unusedGroups` 璇箟鏈彉銆?
琛ョ殑 2 鏉★細
- **`usage = null`锛坲sageTracking 鍏抽棴锛?* 鈫?姣忛」閮借惤 `no-data` 涓?`used === null`锛宍bytes` 鐓у父缁欏嚭
- **绔埌绔彛寰?*锛氳蛋鐪熷疄 `tracker.record()` + `summarize()` 鈫?璇ユ爣绛?`used === 1` 鈫?`findUnclaimed` 鍒?`do-not-claim`锛?  骞舵柇瑷€"鏈棰嗗垪琛ㄩ噷姣忎釜鏍囩閮借兘鍦?`byTag` 閲屾煡鍒?锛堝惁鍒欎細璇惤鍋?`no-data`锛?
**鍏ㄩ噺 370 椤归€氳繃銆?*

## [1.19.3] 鈥?2026-10-31

**鍔犲浐鐗堬紝娌℃湁鏂板姛鑳?*锛氭妸涓夋潯"鍙ｅご绾﹀畾"鍙樻垚绾㈢豢淇″彿銆傛敼鍔ㄥ叏閮ㄥ湪 `test/`銆乣docs/`銆乣scripts/lint.mjs`锛?**`index.js` 涓€琛屾病鍔紙浠?1198锛?*銆?
### Added 鈥斺€?6 鏉℃柊鏂█锛坄test/infra.test.mjs` 8 鈫?15 鏉★級

1. **妯″潡榛樿鍏抽棴**锛氱敤 `import('../lib/union.js?fresh=...')` 鎷垮叏鏂板疄渚嬫柇瑷€锛?   涓嶄緷璧?娴嬭瘯鎸夊０鏄庨『搴忔墽琛?銆傛棫鍐欐硶鍦ㄦ湁浜虹粰娴嬭瘯鏂囦欢鍔?`concurrency` 鍚庝細闈欓粯澶辨晥銆?2. **`scoreText` 绛夐珮澶瑰叿**锛堜富鏂█锛夛細涓や釜鐢诲儚鍏抽敭璇嶅畬鍏ㄧ浉鍚?鈫?鍒嗘暟鐩哥瓑 鈫?margin 0锛?   鍏抽棴鎬佸繀椤昏繑鍥?`null`锛堟斁寮冭矾寰勪繚鐣欙級锛屽紑鍚€佹墠缁欎袱涓樁娈点€傝澶瑰叿瀵规潈閲嶈皟鏁翠笉鏁忔劅銆?3. **`scoreText` 鍥炲綊鏍蜂緥**锛堣緟鏂█锛夛細瀹炴祴 score 21.793 / second 14.075 / margin 0.354锛?   鍏抽棴鎬?鈫?鍗曢樁娈?`beta-stage`锛屽紑鍚€?鈫?涓ら樁娈点€傛敞閲婂啓鏄?鏉冮噸鍙樹簡瑕侀噸鏂伴噰鏍?銆?4. **`detectStage` 鍙屾ā寮忓鐓?*锛氬悓涓€鍙ュ叧闂€?`python-code`銆佸紑鍚€?`document-write+python-code`銆?5. **`strict` 涓嶈骞堕泦缁ф壙**锛堜袱鏉★級锛氬悎鎴愰樁娈垫病鏈?`strict` 瀛楁锛?   瀛愰樁娈垫爣 `strict:true` 涔熶笉澶栨孩鍒板苟闆嗏€斺€旀湭璁ら鏍囩浠嶆斁琛屻€?   锛堟祴璇曢噷蹇呴』鐢?`withUnion()` 鍖呬竴灞傦紝鍚﹀垯鏅€氬睍寮€浼氫涪 Proxy 瀵艰嚧"鍋囩豢"銆傦級
6. **鎺㈤拡璁板綍閿櫧鍚嶅崟瀹屽叏涓€鑷?*锛?0 閿級锛氫互鍚庤皝寰€璁板綍閲屽姞瀛楁锛堝挨鍏跺綊鍥犲瓧娈碉級杩欐潯绔嬪埢绾紝
   閫艰揩鏀瑰瓧娈电殑浜哄悓姝ョ櫧鍚嶅崟涓?`docs/LIMITS.md`銆?
### Docs

- `docs/LIMITS.md`锛氳ˉ"骞堕泦涓嶇户鎵?strict 鏄璁℃剰鍥句笉鏄阀鍚?銆?`bytes` 鏄睍绀哄€硷紙涓?token 闈?1:1銆佷笉鍙備笌瑁佸壀锛?銆?  鏈湴鍒嗙被鍣ㄧ疆淇″害鍒濆榛樿 `0.75`锛堝彲閰?`localMinConfidence`锛?- 鏂板 `docs/ROADMAP.md`锛歚index.js` 涓夋鎷嗗垎锛堣Е鍙戞潯浠?>1150 琛屾垨闇€鍑€澧?>5 琛岋級銆?  骞堕泦鍘荤暀锛?10 娆?鍛?鈫?鍏?`@deprecated` 涓€鐗堝啀鍒狅級銆佹帰閽?`stage` 鎺ョ嚎鐨勫厛鍚庨『搴?
### Changed 鈥斺€?lint 鏂囨

- 瓒呯嚎鏃惰緭鍑?宸茶秴 N 琛?锛屾湭瓒呮椂杈撳嚭"杩樺墿 N 琛?锛屼笉鍐嶅嚭鐜拌礋鏁颁綑閲忥紱闃堝€间笉鍙橈紙>1100 璀﹀憡 / >1200 澶辫触锛?
**鍏ㄩ噺 363 椤归€氳繃**锛?56 鈫?363锛夈€?
## [1.19.2] 鈥?2026-10-31

> This is a personal infrastructure release. Experimental unions are disabled by default. Designed for extensibility.

涓汉鍩哄缓鏀跺熬鐗堬細涓嶅啀涓?灏忕櫧浣撻獙"鐗虹壊鏋舵瀯锛屽簳绾挎槸**鏀拺鍚庣画澶ч噺绗笁鏂规彃浠朵笌鎴戣嚜宸辩殑鏂版彃浠?*銆?
### Changed 鈥斺€?骞堕泦杞?`@experimental`锛岄粯璁ゅ叧闂?
- 鏂板閰嶇疆 `unionEnabled`锛堥粯璁?**false**锛夛紝`cordis.patch.yml` 閲屾樉寮忓啓鍑哄苟娉ㄦ槑鍘熷洜
- 鍏抽棴鏃?`detectStage` 涓庢墦鍒嗗櫒**閮戒笉浜у嚭** `"a+b"`锛岃涓轰笌寮曞叆骞堕泦涔嬪墠瀹屽叏涓€鑷?- `route_status` 鏂板 `unionEnabled` 瀛楁锛屼竴鐪煎彲瑙佸綋鍓嶆槸鍚﹀惎鐢?- 瀹炴祴浠ｄ环锛堝啓杩?`docs/LIMITS.md`锛夛細骞堕泦 154 宸ュ叿 / 134,539 瀛楄妭 vs 鍗曢樁娈?54 / 46,326锛?*绾?3 鍊?*锛?
### Added 鈥斺€?鏈棰嗘爣绛剧殑浣撶Н褰掑洜

- `lib/classify.js` 鏂板 `tagBytesOf(schemas, coreTools)`锛氭寜鏍囩绱姞宸ュ叿澹版槑瀛楄妭
- `findUnclaimed` 杈撳嚭澧炲姞 `bytes`锛堟棤鏁版嵁濉?**0**锛岀粷涓?undefined锛夛紝骞舵寜浣撶Н闄嶅簭
- `route_status` 鐨?`unclaimedTags` 鐜板湪甯︿綋绉?鈥斺€?鐢?*浜?*鍐冲畾瑕佷笉瑕佸啓 `custom_stages.json`锛屾彃浠朵笉鎿呰嚜瑁佸壀

### Hardened 鈥斺€?鏈棰嗗嵆鏀捐锛堝熀寤哄簳绾匡級

- 鏂板 `test/infra.test.mjs`锛? 椤癸級锛氭湭璁ら鏍囩鍦?*浠讳綍闃舵**锛堝惈骞堕泦锛夐兘涓嶅緱琚嫆缁濄€?  姘镐笉杩?deny銆佸敮涓€渚嬪鏄樁娈垫樉寮?`strict:true`
- 鏂板鏂█锛氭帰閽堣褰?*涓嶅惈**浠讳綍"鍝釜鎻掍欢鏀逛簡浠€涔?鐨勫綊鍥犲瓧娈碉紙涓嶈秺鏉冿級

### Refactor 鈥斺€?index.js 鑵捐

- `RENDER` / `toNum` 鎼埌 `lib/util.js`锛宨ndex.js **1198 鈫?1195 琛?*锛堝姞瀹屾柊鍔熻兘鍚庡洖鍒?1198锛屼粛鍦?1200 瀹堝崼绾垮唴锛?
### Docs

- 鏂板 `docs/LIMITS.md`锛氬苟闆嗕唬浠枫€佹湰鍦板皬妯″瀷鎺ュ彛涓庡惎鐢ㄦ潯浠讹紙鏈増涓嶅啓浠ｇ爜锛夈€佹湭璁ら鏀捐銆?  鏀剁獎澶熶笉鍒扮殑涓滆タ銆佹帰閽堣亴璐ｈ竟鐣?
**鍏ㄩ噺 356 椤归€氳繃銆?*

## [1.19.1] 鈥?2026-10-31

骞堕泦鍔熻兘钀藉湴杩囩▼涓紝绔埌绔祴璇曟姄鍑轰簡**涓や釜鐪?bug**锛堥兘涓嶆槸骞堕泦绠楁硶鏈韩鐨勯棶棰橈級銆?
### Fixed 1锛氬叧閿瘝璺緞浼?鎶㈠厛 return"锛屽苟闆嗘案杩滀笉瑙﹀彂

`detectStage` 鍘熸潵鏄?绗竴涓懡涓殑闃舵鐩存帴杩斿洖"銆?璺ㄩ鍩熷彞"鍐欎釜 Python 鑴氭湰鈥︽暣鐞嗘垚鍛ㄦ姤鏂囨。"閲岋紝**"鑴氭湰"鍚屾椂鍛戒腑 python-code锛屽彞瀛愬張鍛戒腑 document-write**锛?浣嗙涓€娆″懡涓氨 return 浜嗭紝璋冪敤鏂?`index.js` 鐨勬剰鍥惧垽瀹氾紙浼氳繑鍥炲苟闆嗭級**鏍规湰娌℃満浼氳窇**銆?
淇硶锛歚detectStage` 鍏堟敹闆嗘墍鏈夊懡涓樁娈碉紱**鍛戒腑 鈮? 涓椂**濮旀墭 `lib/intent.js` 鐨勬墦鍒嗗櫒缁欑粨璁猴紝
涓斿彧鎺ュ彈"缁撹閲岀殑闃舵閮界湡鐨勫懡涓繃鍏抽敭璇?鐨勭粨鏋滐紙闃叉鎵撳垎鍣ㄥ嚟绌哄紩鍏ラ樁娈碉級銆?Unity 鍦烘櫙涓嶅彈褰卞搷锛?鍋氫釜 Unity UI 璁剧疆鐣岄潰"浠嶅垽 unity-ui锛屾湁娴嬭瘯瀹堢潃锛夈€?
### Fixed 2锛歚mergeStages` 鎶?Proxy 鍚冩帀浜?
`index.js:434` 鏄?`cfg.stages = mergeStages(DEFAULT_STAGES, 鈥?`锛?鑰?`mergeStages` 杩斿洖**鏅€氬璞?* 鈫?`DEFAULT_STAGES` 涓婄殑 Proxy 涓㈠け 鈫?`cfg.stages["document-write+python-code"]` 鍙樻垚 `undefined` 鈫?骞堕泦鍚嶈褰撴垚"鏈煡闃舵"锛宍route_stage` 鐩存帴鎷掔粷銆?
淇硶锛氬湪 `lib/stages-config.js` 鐨?`mergeStages` 杩斿洖鍊间笂閲嶆柊鍖呬竴灞?`withUnion`銆?**浠嶇劧娌℃湁纰?index.js銆?*

### Added锛氱鍒扮娴嬭瘯锛堥獙鏀舵爣鍑嗘湰韬級

`test/union-e2e.test.mjs` 璧蜂竴涓亣 ctx锛岃皟**鐪熷疄鐨?`apply()`**锛?璧扮湡瀹炵殑 `agent/created` + `agent/inbox/claimed` 閽╁瓙锛屽啀璋?*鐪熷疄鐨?`route_status`**锛?
- 杈撳叆 "甯垜鍐欎釜 Python 鑴氭湰鐖彇缃戦〉锛岀劧鍚庢暣鐞嗘垚涓€浠藉懆鎶ユ枃妗?
- `route_status.stage === "document-write+python-code"`
- `restrictedFor` 涔熸槸骞堕泦锛宍restrictedToolCount > 0`
- `terminal_spawn` / `office_docx_create` / `study_card_add` 閮借繕鍦?- `unity_object_create` / `meshy_image_to_3d` 琚憳鎺?- 鏈棰嗘爣绛撅紙ego锛変繚鐣?鈥斺€?涓嶈鏉€鏂版彃浠舵槸璁捐搴曠嚎

鍐欒繖涓祴璇曡繕鏆撮湶浜嗕袱涓す鍏峰潙锛氬繀椤诲杺 `agent/created`锛堝惁鍒?router 娌℃湁 agentRefs锛屾敹绐勪笉鐢熸晥锛夈€?蹇呴』鍏虫帀 `autoRestrictPolicy`锛堜笂涓嬫枃涓?0 鏃剁畻涓嶅嚭鏀剁泭锛屼細琚垽"涓嶅垝绠?锛夈€?
**鍏ㄩ噺 348 椤归€氳繃**銆?
## [1.19.0] 鈥?2026-10-31

**澶氶鍩熷苟闆?*锛氳法棰嗗煙浠诲姟涓嶅啀"鍒や笉鍑烘潵灏变粈涔堥兘涓嶅仛"銆?
### 璧峰洜

鎰忓浘鍒ゆ柇鍣紙`lib/intent.js`锛夊湪涓や釜闃舵鍒嗘暟鎺ヨ繎鏃?`margin` 涓嶅锛岀洿鎺?`return null`銆?浜庢槸"甯垜鍐欎釜 Python 鑴氭湰鐖彇缃戦〉锛岀劧鍚庢暣鐞嗘垚涓€浠藉懆鎶ユ枃妗?杩欑鍙ュ瓙**涓€涓鍩熼兘璁や笉鍑烘潵**锛?router 鍋滃湪鍘熷湴锛屼袱杈圭殑宸ュ叿閮芥病鏀惧紑銆?
### 鏀逛簡浠€涔?
1. `scoreText` 鐜板湪鍙互杩斿洖 1~2 涓樁娈碉細
   ```
   stage:  "document-write+python-code"
   stages: ["document-write", "python-code"]
   reason: "union-strong-second"
   ```
2. **鍒ゆ嵁浠?鍙湅鐩稿宸窛"鏀规垚"鐪嬬粷瀵瑰己搴?**锛?   鐩爣鍙ラ噷鏂囨。渚?22.7 鍒嗐€佷唬鐮佷晶 15.4 鍒嗭紝margin 32%锛堣秴杩?0.28 闃堝€硷級鈥斺€?   鑰佽鍒欎細鍒ゆ垚"鍗曢鍩?锛屼絾 15.4 鍒嗘牴鏈笉鏄櫔闊炽€?   鏂拌鍒欙細**绗簩鍚嶆湰韬寮猴紙鈮?minScore脳3锛変笖绗竴鍚嶆病鍘嬪€掑畠锛坢argin < 0.55锛夆啋 骞堕泦**銆?3. `lib/union.js`锛氱敤 **Proxy** 璁?`stages["a+b"]` 鑳界幇鍦哄悎鎴愬苟闆嗗畾涔夈€?   `index.js` 閲屾墍鏈夐樁娈佃闂湰鏉ュ氨鏄?`stages[name]` 涓嬫爣璇诲彇锛堝惈 classify.js / prompt.js锛夛紝
   鎵€浠?*涓€涓?Proxy 鍏ㄩ儴鐢熸晥锛宨ndex.js 涓€琛屾病鍔紙浠嶆槸 1198 琛岋級**銆?   `Object.keys` 浠嶅彧鍒楃湡瀹為樁娈碉紝鍚堟垚鍚嶄笉浼氭紡杩涢厤缃笌鐘舵€侀潰鏉裤€?4. 鏂板涓や釜**闈?Unity** 闃舵 `python-code` / `document-write`锛宎llow 閲屽悓鏃跺啓
   鐞嗘兂鏍囩锛坧ython/office锛屾湰鏈轰笉瀛樺湪浣嗘棤瀹筹級涓庣湡瀹炴爣绛撅紙terminal/study锛夛紝
   淇濊瘉骞堕泦鍦ㄧ湡鏈轰笂**鐪嬪緱瑙?*鑰屼笉鏄┖杞€?
### 娴嬭瘯

鏂板 `test/union.test.mjs`锛?7 椤癸級锛屽埢鎰忓叏閮ㄤ娇鐢ㄩ潪 Unity 鍦烘櫙锛?
- 骞堕泦鍚嶇殑瑙ｆ瀽/鍚堟垚/鍘婚噸/缂撳瓨绋冲畾鎬?- 鐩爣鍙?鈫?鍚屾椂杩斿洖涓や釜闃舵
- 鍗曢鍩熷彞銆乁nity UI 鍙ャ€佹棤鍏冲彞**鍧囨棤鍥炲綊**
- 鐘舵€佹満鎺ュ彈骞堕泦鍚嶏紙涓嶈褰撴垚鏈煡闃舵鎷掓帀锛?- 瓒婄晫鍒ゅ畾锛氬苟闆嗛噷涓よ竟鐨勫伐鍏烽兘鏀捐锛宍unity_*` 浠嶈鎷?
**鍏ㄩ噺 346 椤归€氳繃**锛堝師 329 椤癸級銆?
## [1.18.0] 鈥?2026-10-31

涓変欢"涓诲姩鐨勮仾鏄?锛氫笉鍐嶅彧鏄鍔ㄥ搷搴旓紝鑰屾槸**鑷繁鍒ゆ柇鍒掍笉鍒掔畻銆佽涓嶈寮€鍙ｃ€佹嫤寰楀涓嶅**銆?
### 鏂板 路 鏅鸿兘寮€鍏筹紙`autoRestrictPolicy`锛岄粯璁ゅ紑锛?鍒囬樁娈垫椂鍏堢畻璐︼細閲嶅缓鎴愭湰锛堚増 褰撳墠涓婁笅鏂囧叏浠凤級梅 姣忚疆鏀剁泭锛堣鎽樻帀閭ｉ儴鍒嗗伐鍏峰０鏄庣殑 token锛? 鍥炴湰杞暟銆?- 鍥炴湰 鈮?`switchPaybackTurns`锛堥粯璁?3 杞級鈫?鐓у父鐗╃悊鐦﹁韩
- 鍥炴湰 > 3 杞紙鍏稿瀷锛?0 涓?token 鐨勪細璇濓級鈫?**鍙彁绀轰笉鐦﹁韩**锛岄伩鍏嶇櫧浠樹竴娆″叏閲忛噸寤?- `route_stage` 鏄惧紡鍒囨崲涓嶅彈褰卞搷锛堢敤鎴蜂翰鍙ｈ姹傜殑鐓у姙锛?
### 鏂板 路 涓诲姩寤鸿锛堝熬閮ㄦ彁绀洪噷鐨?`Tip:`锛?璇箟鍒嗘病鍒?鏁㈠垏"鐨勯棬妲涖€佷絾鏄庢樉鏈夋劅鏃讹紝涓嶅垏闃舵锛屽彧鍦ㄥ熬閮ㄦ彁绀洪噷鍔犱竴鍙ワ細
`Tip: looks like art; if so, route_use(["art"],3).`
鎶婂喅瀹氭潈浜ゅ洖妯″瀷锛岄浂棰濆璇锋眰锛屼粛鍙?200 瀛楃‖涓婇檺绾︽潫銆?
### 鏂板 路 鎷︽埅鍥炴敹缁熻锛坄denyRecovery`锛?琚嫤鍚?2 鍒嗛挓鍐呮ā鍨嬫崲浜嗕釜宸ュ叿缁х画骞?鈫?璁颁竴娆?鑷繁鎭㈠"銆?`route_status.denyRecovery` 缁欏嚭 `{denied, recovered, rate, note}`锛岀敤鏉ュ垽鏂?*鎷︽埅闃堝€兼槸涓嶆槸澶弗銆佹彁绀烘枃妗堟槸涓嶆槸澶ā绯?*銆?
### 鏂板 路 鏈満璋冨弬鑴氭湰
```
node scripts/tune.mjs --days 7
```
璇?`~/.dsh/minimal-router/` 涓嬬殑 activity / tool-usage锛岀洿鎺ョ粰浣犺皟鍙傚缓璁紙鏁版嵁涓嶅嚭鏈満锛夈€?
### 娴嬭瘯
- 320 鈫?**329**锛坒eedback 7 + intent 鎺㈤拡 2锛?
## [1.17.0] 鈥?2026-10-31

**"瀹冨埌搴曞仛浜嗕粈涔?** 鈥斺€?鏂板娲诲姩鏃ュ織涓?`route_activity` 宸ュ叿銆?
### 鏂板 路 娲诲姩鏃ュ織锛坄lib/activity.js`锛?- 璁板綍涓冪被浜嬩欢锛歚switch`锛堝垏闃舵锛夈€乣restrict`锛堟敼宸ュ叿琛級銆乣deny`锛堟嫤璋冪敤锛夈€乣block`锛堥椄闂ㄦ嫤鎴級銆乣grant`锛堜复鏃舵敹绐勶級銆乣reset`锛堝浣嶏級銆乣degrade`锛堥檷绾э級
- 钀界洏 `~/.dsh/minimal-router/activity.jsonl`锛?*鍙暀鏈€杩?200 鏉?*锛岃秴杩?256KB 鑷姩閲嶅啓灏鹃儴
- 鍐欑洏澶辫触鍙奖鍝嶈繖鏉℃棩蹇楋紝涓嶅奖鍝嶄富娴佺▼

### 鏂板 路 `route_activity` 宸ュ叿
```
route_activity()                    # 鏈€杩?20 鏉?route_activity({ kind: "deny" })    # 鍙湅琚嫤涓嬬殑璋冪敤
```
杩斿洖 `summary`锛堜汉璇濇眹鎬伙級+ `events`锛堟渶鏂板湪鍓嶏級銆俙route_status` 閲屼篃甯︿簡 `activity` 涓?`recentActivity`锛堟渶杩?5 鏉★級锛屼笉璋冨伐鍏蜂篃鑳界灔涓€鐪笺€?
### 閲嶆瀯
- `DEFAULT_STAGES` / `STAGE_ORDER` 鎼埌 `lib/stages-default.js`锛堢函鏁版嵁锛岃鍏ュ彛鏂囦欢鍥炲埌 1200 琛屽畧鍗嚎鍐咃級
- 宸ュ叿琛ㄤ粠 9 涓彉 11 涓紙鏂板 `route_use`銆乣route_hint`銆乣route_activity` 鍦ㄦ枃妗ｉ噷琛ラ綈锛?
### 娴嬭瘯
- 312 鈫?**320**锛坅ctivity 8锛?
## [1.16.0] 鈥?2026-10-31

涓変釜"鏇磋仾鏄?鐨勮兘鍔涳紝**鍏ㄩ儴闆堕澶栬姹?*锛堜笉璋冩ā鍨嬶紝涓嶅彂绗簩閬嶄笂涓嬫枃锛夈€?
### 鏂板 路 璇箟鎵撳垎璺敱锛坄lib/intent.js`锛?- 鍏抽敭璇嶆病鍛戒腑鏃讹紝鐢ㄦ湰鍦板瓧绗︾粺璁★紙CJK 浜屽厓缁?+ 鎷変竵璇嶏級缁欐瘡涓樁娈垫墦鐢诲儚鍒?- **棰嗗厛涓嶅灏辫繑鍥?null**锛岄€€鍥?绮樹綇褰撳墠闃舵"鈥斺€斿畞鍙笉鍔紝涔熶笉鐚?- 瀹炴祴锛歚甯垜鎶婇偅涓寜閽尓涓€涓媊 鈫?`unity-ui`锛沗浠婂ぉ澶╂皵鎬庝箞鏍穈 鈫?涓嶅垏
- 閰嶇疆锛歚intentRouting`锛堥粯璁ゅ紑锛夈€乣intentMinScore`銆乣intentMinMargin`

### 鏂板 路 绌鸿浆宸ュ叿鐢诲儚锛坄lib/usage.js`锛?- 璁板綍姣忎釜宸ュ叿琚?*鐪熸璋冪敤**杩囧嚑娆★紙`~/.dsh/minimal-router/tool-usage.json`锛?- `route_status.toolUsage` 鐩存帴鍛婅瘔浣狅細鏈夊灏戝伐鍏蜂粠瑁呬笂鍒扮幇鍦?*涓€娆￠兘娌＄敤杩?*
- 鍙粰寤鸿锛屼笉鑷姩鍗歌浇锛堝嵏杞芥槸涓嶅彲閫嗙殑璺ㄩ」鐩搷浣滐級

### 鏂板 路 鑷€傚簲闃舵锛坄lib/adaptive.js`锛岄粯璁ゅ叧闂級
- 浠?*鏈€杩?20 娆＄湡瀹炶皟鐢?*閲屽锛氭煇缁勫崰 60% 浠ヤ笂涓?鈮? 娆★紝鎵嶅湪 auto 闃舵鎻愯鍒囨崲
- 浠嶈杩囨垚鏈椄闂?+ 杩熸粸锛堜竴娆″懡涓笉浼氬垏锛?- 閰嶇疆锛歚adaptiveStage`銆乣adaptiveWindow`銆乣adaptiveMinCalls`銆乣adaptiveMinShare`

### 娴嬭瘯
- 288 鈫?**312**锛坕ntent 11 + usage 6 + adaptive 7锛?
## [1.15.1] 鈥?2026-10-31

鎶?1.15.0 鐣欎笅鐨勫熬宸村仛瀹岋細**鎷︽埅 / 浣撴 / 鐔旀柇 / 闄嶇骇鐨勫師鍥犳枃妗堝叏閮ㄨ嫳鏂囧寲**銆?
杩欎笁绫绘枃妗堝彧鍦ㄥ嚭閿欐椂鍑虹幇锛屼絾瀹冧滑鍏跺疄鏄?*鏈€璇ュ啓娓呮**鐨勫湴鏂光€斺€擜/B 鏃╁氨璇佹槑锛?绮剧‘鐨勬嫆缁濅俊鎭瘮妯＄硦鐨勬彁绀烘洿鑳借妯″瀷鑷繁绾犳銆傛墍浠ュ畠浠篃蹇呴』璁╂ā鍨嬭寰楁噦锛?
| 鍘?| 鐜?|
|---|---|
| `銆愰樁娈佃秺鐣屻€戝綋鍓嶉樁娈?鈥?璇风珛鍗宠皟鐢?route_stage("art")鈥 | `[out-of-stage] Current stage=鈥?Call route_stage("art")鈥 |
| `銆愭湰鍦颁綋妫€鎷掔粷銆戠 2 琛岋細鈥?璇风珛鍗虫敼鍐欒繖娈典唬鐮乣 | `[local lint] blocked 鈥?N high-risk pattern(s): line 2: 鈥?Rewrite that code before retrying` |
| `銆恉sh-minimal-guard 宸茬啍鏂€戣繛缁?3 娆♀€ | `[dsh-minimal-guard] circuit breaker tripped 鈥?3 consecutive tool calls failed鈥 |
| `妯″瀷 x 涓嶅湪宸茬煡鑳藉姏琛ㄩ噷锛屾寜涓嶅畨鍏ㄥ鐞哷 | `model x is not in the known capability table; treated as unsafe` |

杩炲甫淇簡 **10 澶勬祴璇曟柇瑷€**锛堝畠浠柇瑷€鐨勬鏄繖浜涗腑鏂囨枃妗堬級銆?涓ゆ鎵弿纭锛歚reason:` 涓?`銆恅 寮€澶寸殑瀛楃涓查噷锛?*涓枃 = 0**銆?
**288 椤规祴璇?*銆?
> 浠嶇劧淇濈暀涓枃鐨勫彧鍓╋細鎺у埗鍙拌鍛娿€乣route_status` / `cache_probe_report` 閲岀殑 `hint`銆佷互鍙婃敞閲婂拰鏂囨。銆?> 杩欎簺瑕佷箞鏄粰浜虹湅鐨勶紝瑕佷箞鏄紑鍙戣€呰嚜宸辫鐨勩€?
## [1.15.0] 鈥?2026-10-31

鎶?*缁欐ā鍨嬬湅鐨勪笢瑗?*鍏ㄩ儴鏀规垚鑻辨枃銆傝繖鏄湰椤圭洰閲屽敮涓€琚瀹氫负"鍔熻兘鎬х己鍙?鐨勯潪浠ｇ爜闂銆?
### 涓轰粈涔?
`locale/zh.json` 鍙炕璇戜簡鎻掍欢鍚嶅拰涓€鍙ヨ瘽绠€浠嬶紙`meta`锛夈€傝€?**10 涓伐鍏风殑 `description`銆?鍙傛暟璇存槑銆佷互鍙婃瘡涓€杞兘瑕佸彂鐨勫熬閮ㄦ彁绀猴紝鍏ㄦ槸纭紪鐮佷腑鏂?*銆?
瀵规ā鍨嬫潵璇达紝宸ュ叿鐨?`description` 灏辨槸浣跨敤璇存槑涔︺€?*鑻辨枃浠诲姟閰嶄腑鏂?schema锛岄€夊伐鍏风殑鍑嗙‘鐜囦細鎺?*
鈥斺€旇€岃繖姝ｆ槸鎻掍欢鏈€鏍稿績鐨勮兘鍔涖€傛墍浠ヨ繖涓嶅彨"涓嶅绮捐嚧"锛屽彨**瀵归潪涓枃鐢ㄦ埛闄嶇骇**銆?
### Changed

- **10 涓伐鍏风殑 description + 鍏ㄩ儴鍙傛暟璇存槑 鈫?鑻辨枃**锛坄route_stage` / `route_status` / `route_init` /
  `route_reset` / `route_use` / `route_hint` / `cache_probe_report` / `cache_probe_clear` /
  `guard_status` / `guard_reset`锛?- **灏鹃儴璺敱鎻愮ず 鈫?鑻辨枃**锛屽苟鍘嬬缉鎺緸璁?`unity-code` 杩欑鏈€闀跨殑闃舵涔?*姝ｅソ钀藉湪 200 瀛楀唴涓嶆埅鏂?*
  锛堣嫳鏂囨瘮涓枃闀匡紝绗竴鐗堢洿鎺ラ《鍒颁笂闄愯鎴簡锛?- 鑷姩妫€鏌ワ細`grep` 鍥涗釜婧愭枃浠讹紝**涓枃 description 琛屾暟 = 0**

### 杩樻病鍋氱殑锛堜笅涓€鎵癸級

- 鎷︽埅鏂囨 / 浣撴鏂囨 / 鐔旀柇鎻愮ず锛坄銆愰樁娈佃秺鐣屻€戔€銆乣銆愬凡鐔旀柇銆戔€锛変粛涓轰腑鏂?鈥斺€?杩欎簺鍙湪鍑洪敊鏃跺嚭鐜?- 鎺у埗鍙拌鍛婏紙`[minimal-router] 鈥锛変粛涓轰腑鏂?鈥斺€?杩欎簺鏄粰浜虹湅鐨?- `route_status` / `cache_probe_report` 杩斿洖閲岀殑 `hint` 瀛楁浠嶄负涓枃

**288 椤规祴璇?*銆?
## [1.14.1] 鈥?2026-10-31

鎶?allow 妯″紡鐪熸満璺戜簡 8 涓細璇濄€傜粨璁烘槸锛?*瀹冩洿鐪侊紝浣嗕細钘忓潖宸ュ叿 鈥斺€?鎵€浠ラ粯璁ゅ繀椤讳繚鎸?deny銆?*

### 瀹炴祴锛堝悓闃舵 core銆佸悓浠诲姟銆佸彧宸?restrictMode锛屾瘡鑷?4 涓細璇濓級

| 缁?| tools | toolsChars | `read` 鍙敤锛?|
|---|---|---|---|
| 涓嶈鍓紙auto锛?| 172 | 138,711 | 鉁?|
| **deny**锛堥粯璁わ級 | **72** | **50,101** | 鉁?|
| **allow** | **39** | **17,015** | 鉂?**4/4 鍏ㄤ涪** |

**allow 鍐嶇渷 66%**锛?7,015 vs 50,101 瀛楄妭锛夛紝浣?4 涓細璇?*鍏ㄩ儴**鎶?`Error: unknown tool "read"`锛屽彧鑳芥敼鐢ㄧ粓绔鏂囦欢銆?
### 涓轰粈涔?
`restrict({allow})` 鐨勮涔夋槸"鍙暀鐐瑰悕鐨?銆傝€?**`read` / `write` 杩欑被浣滅敤鍩熸湰鍦版敞鍐岀殑宸ュ叿
涓嶅湪 `restrictableNames` 閲?* 鈥斺€?鎴戜滑鐐逛笉鍑哄畠浠殑鍚嶅瓧锛屼簬鏄?allow 鍒楄〃閲屾病鏈夊畠浠紝
琚?鍙暀鐐瑰悕鐨?涓€璧疯棌鎺夈€傝繖涓嶆槸 bug锛屾槸璇箟鍐冲畾鐨勩€?
鎵€浠ワ細

- **`deny` 淇濇寔榛樿**锛堝彧鎽樼偣寰楀嚭鍚嶅瓧鐨勫伐鍏凤紝涓嶈浼わ級
- `allow` 淇濈暀涓哄彲閫夛紝骞跺湪 `cordis.patch.yml` 涓庢枃妗ｉ噷鍐欐槑"浼氶殣钘忕偣涓嶅嚭鍚嶅瓧鐨勫伐鍏凤紝鍙兘涓㈠姛鑳?

### 椤哄甫涓€涓В閲婁簡寰堜箙鐨勮皽

`estimatedAdvertised` 涓€鐩存姤 **38**锛屼袱涓ā寮忛兘涓€鏍枫€傚疄闄咃細allow 鏄?**39**锛?8 + `run_code`锛夛紝
deny 鏄?**72**銆備篃灏辨槸璇?*杩欎釜浼扮畻鎻忚堪鐨勫叾瀹炴槸 allow 璇箟**鈥斺€旀嬁瀹冨幓瑙ｉ噴 deny 褰撶劧瀵逛笉涓娿€?杩欏氨鏄?1.13.2/1.13.3 閲岄偅涓?38 vs 72"璋滃洟鐨勬渶澶栧眰瑙ｉ噴銆?
**288 椤规祴璇?*銆?
## [1.14.0] 鈥?2026-10-31

浠?DSH 婧愮爜閲岀‘璁や簡 `restrict()` 鐨勭湡瀹炵鍚嶄箣鍚庯紝琛ヤ笂涓ゆ潯**鏍规不鎬?*鐨勬敼鍔ㄣ€?
### Added 鈥斺€?`restrictMode: 'allow'`

浠?`@deepseek-ai/dsh-tools/lib/index.js` 璇诲埌锛?
```js
/**
 * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
 */
restrict(filter) { 鈥?}
```

涔熷氨鏄 `allow` 涓€鐩存槸鏀寔鐨勶紝鎴戜滑鍙敤浜嗕竴鍗娿€?
| | `deny`锛堥粯璁わ紝涓嶅彉锛?| `allow`锛堟柊澧烇紝鍙€夛級 |
|---|---|---|
| 渚濊禆"娉ㄥ唽琛ㄦ湁澶氬ぇ" | **鏄?* 鈫?杩欏氨鏄?38/72 閿欓厤鐨勬牴婧?| **鍚?* |
| 缁撴灉鍙娴?| 172鈭?00=72锛屽拰绠楀嚭鏉ョ殑 38 涓嶇 | 鎭板ソ绛変簬鐐瑰悕鐨勯偅浜?|
| 閫傜敤 | 鎯冲敖閲忓皯瑙佸伐鍏?| 鎯宠**纭畾鎬?* |

`restrictMode` 涔熻繘浜嗛檺鍒剁鍚嶏紝鎵€浠ヤ袱绉嶆ā寮忎簰鍒囨椂浼氶噸鏂拌绠楋紝涓嶄細鍥犱负"绛惧悕娌″彉"琚烦杩囥€?涓€涓兘涓嶇暀鏃惰嚜鍔ㄩ€€鍥?`deny`锛堝叏钘忓伐鍏峰お鍗遍櫓锛夈€俙route_status` 鏂板 `restrictMode` 瀛楁銆?
### Fixed 鈥斺€?淇濈暀鍚?`run_code`

婧愮爜閲岃繖鍙ユ槸纭嫤鎴細

```js
if ([...allow ?? [], ...deny ?? []].includes("run_code")) throw new Error(鈥?
```

濡傛灉鐢ㄦ埛寮€浜?PTC 妯″紡锛宍run_code` 浼氬嚭鐜板湪宸ュ叿琛ㄩ噷锛涙垜浠殑 deny 鍒楄〃涓€鏃﹀寘鍚畠锛?**鏁翠釜 `restrict()` 浼氭姏閿?*锛岃€屾垜浠灞傛槸 try/catch 鈥斺€?琛ㄧ幇灏辨槸**闈欓粯涓嶈鍓?*
锛堝張鏄?瑁呬簡娌℃晥鏋?锛夈€傜幇鍦?`run_code` 杩涗簡 `ALWAYS_ALLOW`锛堝洜姝や笉浼氳绠楄繘 deny锛夛紝
`allow` 鍒嗘敮涔熶細鏄惧紡璺宠繃瀹冦€? 鏉℃祴璇曞畧鐫€銆?
### 鐜扮姸

**288 椤规祴璇?*锛坮outer 181 + guard 21 + probe 31 + fuzz 12 + instrument 31 + install-elsewhere 8 + migration 4锛夈€?
> 杩樻病鍋氾細**allow vs deny 鐨勭湡鏈?A/B**銆傚畠闇€瑕佹妸 `restrictMode` 鏀规垚 `allow` 鍐嶉噸杞戒竴娆★紙= 涓€娆″叏浠烽噸寤猴級锛?> 璺戜袱涓瓙浼氳瘽姣?`toolsChars`锛岀劧鍚庢敼鍥炴潵鍐嶉噸杞戒竴娆°€備袱娆￠噸杞界殑璐﹀厛璺熶綘纭銆?
## [1.13.3] 鈥?2026-10-31

鎸?`docs/AB.md` 璺戜簡 **3 杞?*锛屾嬁鍒扮涓€浠藉彲浠ュ紩鐢ㄧ殑绔埌绔暟瀛楋紱鍚屾椂**鍒犳帀浜嗘垜鑷繁鍦?1.13.2 閲屽姞鐨勫亣鏁板瓧**銆?
### 瀹炴祴缁撴灉锛? 杞?脳 2 鑷傦紝浠庡師濮嬫帰閽堣褰曞綊灞烇級

| 缁?| 璇锋眰鏁?| 骞冲潎宸ュ叿鏁?| 骞冲潎宸ュ叿瀛楄妭 |
|---|---|---|---|
| A 鑷傦紙`core`锛岃鍓紑锛?| 23 | 72 | **50,101** |
| B 鑷傦紙`auto`锛岃鍓叧锛?| 26 | 172 | 138,711 |

**宸ュ叿澹版槑鍑忓皯 63.9%**锛屼袱鑷傚伐鍏锋暟鍒嗗埆鏄?72 / 172銆?杩欐槸**纭畾鎬?*鎸囨爣锛堝彧鐢卞伐鍏疯〃鍐冲畾锛夛紝鍙互鐩存帴寮曠敤锛涘懡涓巼涓嶄綔璇佹嵁锛堝瓙浼氳瘽鍒氳捣蹇呯劧浣庯級銆?
### Fixed 鈥斺€?1.13.2 閲屾垜鍔犵殑 `advertisedAfterRestrict` 鏄敊鐨?
涓婁竴鐗堟垜浠ヤ负"restrict 涔嬪悗閲嶆柊璇?`scopedTools.schemas()`"灏辫兘鎷垮埌鐪熷疄鍙鏁般€傚疄娴嬶細

```
鍑忔硶浼?         138 鈭?100 = 38
scoped schemas           = 138   鈫?杩欎釜鎺ュ彛鏍规湰涓嶅弽鏄犻檺鍒?璇锋眰閲屽疄闄?      172 鈭?100 = 72   鈫?鍙湁鎺㈤拡鐭ラ亾
```

**涓や釜"鐪嬭捣鏉ユ洿鍑?鐨勬暟閮芥槸閿欑殑銆?* 瀛楁宸插垹闄わ紝鍙繚鐣?`estimatedAdvertised`锛堝悕瀛楅噷甯?estimate锛夛紝
骞跺湪娉ㄩ噴閲屽啓鏄庯細**鍞竴鏉冨▉鐨勬暟瀛楁槸 `cache_probe_report` 鐨?`tools` / `toolsChars`**銆?娴嬭瘯鏀规垚瀹堝崼寮忔柇瑷€锛氳繖涓瓧娈?*涓嶈鍐嶅嚭鐜?*銆?
### 涔熻涓嬩袱涓綊灞炰笂鐨勫潙

- `scope:"session"` 鏈夋椂浼氭妸瀛愪細璇濈畻杩涚埗浼氳瘽锛? 涓瓙浼氳瘽閲屽氨鏈?1 涓嬁鍒扮埗浼氳瘽鎸囩汗锛夆€斺€?  鎵€浠?A/B 鐨勫綊灞炲繀椤荤敤鍘熷璁板綍 + `byPrefix`锛屼笉鑳戒俊瀛愪細璇濊嚜鎶ャ€?- `tools === 0` 鐨勮褰曟槸"璇锋眰寤虹珛鍓?鐨勭┖璁板綍锛岀畻骞冲潎鏃跺繀椤绘帓闄わ紝鍚﹀垯鏁板瓧浼氳鎷変綆 20% 浠ヤ笂銆?
**285 椤规祴璇?*锛坮outer 178锛夈€?
## [1.13.2] 鈥?2026-10-31

绗竴娆＄湡鐨勬妸 A/B 璺戣捣鏉ヤ簡銆?*瀹冩病璇佹槑"鐪佷簡 X%"锛屼絾瀹冩姄鍒颁簡涓や釜鐪熼棶棰?*鈥斺€旇繖姣斾竴涓紓浜暟瀛楀€奸挶銆?
### A/B 鍋氫簡浠€涔?
涓や釜瀛愪細璇濓紝浠诲姟瀹屽叏鐩稿悓锛堝垏闃舵 鈫?寤?3 涓枃浠?鈫?璇诲洖 鈫?鎶ュ憡锛夛紝鍞竴宸紓鏄 1 姝ワ細
A 鑷?`route_stage("core")`锛堣鍓紑锛夛紝B 鑷?`route_stage("auto")`锛堣鍓叧锛夈€?
**浠庢帰閽堝師濮嬭褰曢噷璇诲嚭鏉ョ殑浜嬪疄**锛堜笉鏄瓙浼氳瘽鑷繁鐨勬眹鎶ワ級锛?
| 鑷?| tools | toolsChars | prefixSig |
|---|---|---|---|
| A锛坈ore锛?| 72 | **50,101** | e3078b10 |
| B / 涓讳細璇濓紙auto锛?| 172 | 138,711 | c04e7cca |

**瑁佸壀纭疄鐢熸晥锛岃€屼笖骞呭害寰堝ぇ锛?38,711 鈫?50,101 瀛楄妭锛堚垝63.9%锛夈€?*

### 鎶撳埌鐨勯棶棰?1锛歚route_status` 鍦ㄨ皫鎶ュ彲瑙佹暟

A 鑷傝嚜鎶?`restrictedToolCount=100`銆乣estimatedAdvertised=38`锛屼絾璇锋眰閲屽疄闄呭墿 **72** 涓€?鍘熷洜锛歞eny 鍒楄〃鏄寜**瀛愪細璇濊嚜宸辩殑娉ㄥ唽琛?*锛?38 涓級绠楃殑锛岃€?`restrict()` 浣滅敤鍦?*鏇村ぇ鐨勫叡浜伐鍏疯〃**锛?72 涓級涓婏細

```
172 鈭?100 = 72   鈫?瀹為檯
138 鈭?100 = 38   鈫?鎴戜滑鎶ョ殑
```

**淇硶**锛氫笉鍐嶇敤鍑忔硶浼般€俙restrict()` 涔嬪悗**閲嶆柊璇讳竴娆?* `scopedTools.schemas()`锛?鏂板瀛楁 `advertisedAfterRestrict`锛堢湡瀹炲彲瑙佹暟锛涜涓嶅埌灏辨槸 `null`锛屼笉鐬庢姤锛夈€?1 娴嬭瘯銆?
### 鎶撳埌鐨勯棶棰?2锛歚scope:"session"` 鍒嗕笉娓呯埗浼氳瘽鍜屽瓙浼氳瘽

涓や釜瀛愪細璇濋兘鎶?`session = 6a12cf96`銆乣toolsChars = 138711` 鈥斺€?**涓€妯′竴鏍?*锛屽洜涓哄畠浠拰涓讳細璇?鍏变韩鍚屼竴涓?`sessionId`锛宍scope:"session"` 鎶婁笁鑰呯殑璇锋眰娣锋垚浜嗕竴涓€?
**淇硶**锛歴ession 浣滅敤鍩熶笅鏂板 **`byPrefix`**锛氭寜鍓嶇紑鎸囩汗鍒嗙粍锛屽垪鍑?杩欎釜浼氳瘽閲屽嚭鐜拌繃鍝嚑绉嶅伐鍏疯〃"
锛堟瘡涓甫 tools / toolsChars / 娆℃暟 / 鍛戒腑鐜囷級銆侫/B 灏辨槸闈犲畠鍖哄垎鐨勩€?
### 椤烘墜淇鐨勫害閲?
浣撶Н瀹堝崼鍘熸潵鏁?*鍘熷琛屾暟**锛坕ndex.js 1511 琛岋級锛岃€屽叾涓?27% 鏄敞閲娾€斺€旂瓑浜庡湪鎯╃綒鍐欐敞閲娿€?鏀规垚鍙暟**浠ｇ爜琛?*锛堝綋鍓?1105 琛岋級锛岄槇鍊奸噸鏂版牎鍑嗗埌 1200銆傝繖涓嶆槸鏀惧鏍囧噯锛屾槸鎹簡涓纭殑灏哄瓙銆?
### 娌″仛鍒扮殑锛堣娓呮锛?
- 鏈鏀瑰姩**娌℃湁閲嶈浇鎻掍欢鍋氱湡鏈洪獙璇?*锛堥噸杞?= 涓€娆″叏浠烽噸寤猴紝杩欎釜浼氳瘽宸茬粡寰堣吹浜嗭級銆?  `advertisedAfterRestrict` 涓?`byPrefix` 闇€瑕侀噸杞藉悗鎵嶈兘鍦?`route_status` / `cache_probe_report` 閲岀湅鍒般€?- A/B 鐨勬牱鏈粛鐒舵槸 **n=1**銆俙docs/AB.md` 閲屽啓浜嗚璺?3 娆″彇涓綅鏁帮紝杩欐娌¤窇銆?
**285 椤规祴璇?*锛坮outer 178 + guard 21 + probe 31 + fuzz 12 + instrument 31 + install-elsewhere 8 + migration 4锛夈€?
## [1.13.1] 鈥?2026-10-31

涓変欢"绂婚《灏栬繕宸粈涔?閲岃兘鍋氱殑涓や欢鍗婂仛瀹屼簡锛岀涓変欢锛堟敼鍖呭悕锛?*鏌ュ畬璇佹嵁鍚庢挙鍥?*銆?
### Added 鈥斺€?A/B 瀵圭収锛堣繖鏄渶鏈変环鍊肩殑涓€浠讹級

- **`scripts/analysis/ab-compare.mjs`**锛氬垪鍑烘墍鏈変細璇濈殑鐪熷疄璐﹀崟锛屽苟瀵规瘮浠绘剰涓や釜锛?  璇锋眰鏁般€乸romptTokens銆佸叏浠?鍛戒腑 token銆佸伐鍏峰０鏄庡瓧鑺傘€佸墠缂€閲嶅缓娆℃暟銆佸懡涓巼銆?- **`docs/AB.md` 鍗忚**锛氭€庝箞璺戝嚭涓€瀵?鑳芥瘮"鐨勪細璇濓紙鍚屾ā鍨嬨€佸悓鎻掍欢鐗堟湰銆侀€愬瓧鐩稿悓鐨?10 鏉￠棶棰樸€?  鍞竴宸紓鏄?`enforceByRestrict`锛夛紝浠ュ強**鎶ュ憡璇ユ€庝箞鍐欐墠涓嶆槸鑷**锛?  - 鑳界‘瀹氭€ф瘮杈冪殑鍙湁 **宸ュ叿澹版槑瀛楄妭**
  - 鍛戒腑鐜囪兘鐪嬪嚭"缂撳瓨鏈夋病鏈夎鎵撴柇"
  - **promptTokens 鍚堣涓嶅彲姣?*鈥斺€旈噷闈㈡贩鐫€"杩欐瀵硅瘽鏈夊闀?
  - 蹇呴』涓诲姩鍒楀嚭骞叉壈椤癸紙閲嶈浇鎻掍欢 = 涓€娆″叏浠烽噸寤恒€佹ā鍨嬭緭鍑洪暱搴︿笉绋冲畾銆佷腑閫旇嚜鍔ㄥ垏闃舵锛?
### Changed 鈥斺€?README 绗竴灞忛噸鍐?
鍘熸潵绗竴灞忔槸"鏂囨。寰堝叏"锛屼絾娌℃湁璁╀汉鐣欎笅鏉ョ殑鐞嗙敱銆傜幇鍦細涓€鍙ヨ瘽 鈫?**涓夋潯鍛戒护** 鈫?30 绉掓暟瀛楄〃 鈫?**涓€娈电湡瀹炴帰閽堣褰?* 鈫?璇氬疄杈圭晫銆?
閭ｆ璁板綍鐢ㄧ殑鏄湡鏁版嵁锛?
```json
{ "inputTokens": 563654, "cacheReadTokens": 5504, "promptTokens": 569158, "hitRate": 0.0097 }
```

`hitRate 0.97%` 灏辨槸"鏁存涓婁笅鏂囨寜鍏ㄤ环閲嶇畻"鐨勬牱瀛愨€斺€斿畠姣斾换浣曞舰瀹硅瘝閮芥洿鑳借В閲婅繖涓彃浠朵负浠€涔堝瓨鍦ㄣ€?
### Reverted 鈥斺€?鎴戝叧浜?鍖呭悕澶笟浣?鐨勫垽鏂槸閿欑殑

鎴戝師鏈缓璁妸 `@local/dsh-minimal-router` 鏀规垚鏃犲墠缂€鍚嶃€傛煡浜?profile 鎵嶅彂鐜帮細
**`@local/` 鏄湰鍦?link bundle 鐨勭害瀹氬懡鍚嶇┖闂?*锛岃繖鍙版満鍣ㄤ笂鍙﹀ 23 涓湰鍦板寘
锛坄cursor-plugin-demo`銆乣self-adapt`銆佹暣濂?`unity-*`锛夐兘鐢ㄥ畠銆?
鍗曠嫭鏀逛竴涓細璁?`dsh.profile.bundles` 閲屽嚭鐜板紓绫伙紝杩樿鍚屾椂鍔?`cordis.patch.yml` 鍜岀敤鎴?profile銆?鎵€浠?*涓嶆敼**锛屾敼涓哄湪 `CONTRIBUTING.md` 閲屽啓娓咃細涓轰粈涔堟槸杩欎釜鍚嶅瓧銆乣private: true` 鏄晠鎰忕殑銆?浠ュ強鐪熻鍙?npm 鏃惰鏀瑰摢涓夊锛堝惈"瀵瑰凡瑁呯敤鎴锋槸 breaking change"鐨勬彁閱掞級銆?
> 杩欐潯鏇存鏈韩灏辨槸缁撹锛?*"鐪嬭捣鏉ヤ笟浣?鍜?瀹為檯涓氫綑"鏄袱鍥炰簨**锛屽厛鏌ュ啀鏀广€?
## [1.13.0] 鈥?2026-10-31

琛ヤ笂浜у搧鎵胯閲屾渶鍚庝竴鍧楁病琚噺鍖栫殑涓滆タ锛?*"杩欎釜浼氳瘽鍒板簳鑺变簡澶氬皯"**銆?
### Added

- **`cache_probe_report({"scope": "session"})`** 鈥斺€?鍙粺璁″綋鍓嶄細璇濄€?  杩斿洖鏂板瀛楁 `scope` / `session`锛堜細璇濇寚绾癸級/ `sessionTotal`锛宍summary` 鍙樻垚浼氳瘽绾с€?  榛樿浠嶆槸 `all`锛岃€佽涓轰笉鍙樸€?- **浼氳瘽鎸囩汗鍙瓨鍝堝笇**锛歚describeRequest` 鎶?`options.sessionId` 杩囦竴閬?`fnv1a` 鍐嶈惤鐩橈紝
  **鍘熷 id 涓嶅啓鍏ユ枃浠?*锛堥偅灞炰簬鐢ㄦ埛鏁版嵁锛屾病蹇呰鐣欙級銆傝€佽褰曡瀛楁鏄┖涓诧紝鎸変細璇濊繃婊ゆ椂鑷劧涓嶅尮閰嶃€?- `summarize(records, { session })` 鏀寔鎸変細璇濊繃婊わ紱鏌ヤ笉鍒版椂杩斿洖 0 鑰屼笉鏄洖閫€鎴愬叏閮ㄣ€?- 3 椤规柊娴嬭瘯锛坕nstrument 28 鈫?31锛夛細鎸囩汗绋冲畾涓斾笉鍚師濮?id銆乣makeRecord` 甯︿笂鎸囩汗銆?  `summarize` 鍙粺璁℃寚瀹氫細璇濅笖鏌ヤ笉鍒版椂涓?0銆?
### 鐪熸満楠岃瘉锛堥『渚跨暀涓嬩竴浠芥椿鏁欐潗锛?
閲嶈浇鎻掍欢鍚庣珛鍒诲褰撳墠浼氳瘽璺戜竴娆★細

```
session: "8c144bfe"   sessionTotal: 1
inputTokens: 563,654  cacheReadTokens: 5,504   hitRate: 0.97%
```

**0.97% 鐨勫懡涓巼灏辨槸"涓€娆″叏浠烽噸寤?鐨勬牱瀛?* 鈥斺€?閲嶈浇鎻掍欢浼氳涓嬩竴杞妸鏁存涓婁笅鏂囬噸绠椾竴閬嶃€?杩欐鏄?README 鍙嶅寮鸿皟鐨?闀夸細璇濋噷鍒/鏀规彃浠?鐨勫疄娴嬩緷鎹紝鐜板湪鐢ㄦ埛鑷繁涔熻兘涓€閿湅鍒般€?
**284 椤规祴璇?*锛岃瑕嗙洊鐜?90.32%銆?
## [1.12.2] 鈥?2026-10-31

璁╂枃妗ｉ噷鐨勬暟瀛?*鐪熺殑鍙互琚埆浜哄鐜?*銆備箣鍓嶅畠浠敱涓€涓笉鍦ㄤ粨搴撻噷鐨勮剼鏈畻鍑烘潵鈥斺€旈偅绛変簬鏃犳硶楠岃瘉銆?
### Added

- **`scripts/analysis/`**锛? README锛夛細
  - `switch-cost.mjs` 鈥斺€?澶嶇幇銆屽垏鎹㈡垚鏈槸鍙屽嘲鐨勩€?  - `switch-gaps.mjs` 鈥斺€?澶嶇幇銆屽喎鍗?60 绉?/ 鏃堕棿绐?5 鍒嗛挓銆嶇殑鏉ユ簮
  - `hint-cost.mjs` 鈥斺€?澶嶇幇銆屾彁绀烘瘡杞?50~126 token銆嶏紙纭畾鎬ц绠楋級
  閮芥敮鎸?`--data <path>`锛堝彲閲嶅锛夛紝榛樿璇?`~/.dsh/minimal-router/usage.jsonl`銆?- `scripts/analysis/README.md` 鍐欐竻姣忎釜鑴氭湰瀵瑰簲鏂囨。閲屽摢鍙ヨ瘽锛屼互鍙?*涓轰粈涔堜笉鑳界敤骞冲潎鍊兼弿杩板弻宄板垎甯?*銆?
### 淇簡鑴氭湰鑷繁鐨勪袱涓垎绫?bug

1. 渚垮疁妗ｈ鎸?鍗犱笂涓嬫枃姣斾緥"鎵撳嵃锛屼簬鏄細璇濆彧鏈?141 token 鏃舵樉绀烘垚 `100.0%`锛岀湅鐫€鑷浉鐭涚浘 鈥斺€?   鏀规垚渚垮疁妗ｇ湅**缁濆 token**銆佺伨闅炬。鐪?*姣斾緥**銆?2. "鏀瑰姩骞呭害 vs 浠ｄ环"鐨勫姣旀嬁浜嗕竴涓?`toolsDelta: 0` 鐨勬牱鏈紙鍏跺疄鏄郴缁熸彁绀哄彉浜嗭級锛?   娣蜂簡鍙橀噺 鈥斺€?鐜板湪鍙瘮杈?*绯荤粺鎻愮ず娌″彉銆佺函宸ュ叿琛ㄥ彉鍖?*鐨勬牱鏈€?
### 椤轰究鏇存柊浜嗕竴缁勬洿寮虹殑璇佹嵁

鐢ㄥ綋鍓?866 鏉¤褰曢噸璺戯紝缁撹姣斿師鏂囨。鏇存瀬绔細

```
鏀瑰緱寰堝ぇ鍗村緢渚垮疁锛?5,458 瀛楄妭 鈫?    141 token
鏀瑰緱寰堝皬鍗村緢璐? 锛?  153 瀛楄妭 鈫?671,039 token      鈫?宸?4759 鍊?```

> **娉?*锛欳HANGELOG 閲屽紩鐢ㄧ殑娆℃暟/姣斾緥鏄?**2026-10-30 鐨勫揩鐓?*锛?15 鏉¤褰曪級銆?> 鎺㈤拡鏁版嵁浼氭寔缁闀匡紝閲嶈窇寰楀埌鐨勬暟鍊煎繀鐒朵笉鍚屸€斺€?*鍙鐜扮殑鏄柟娉曪紝涓嶆槸鏌愪竴澶╃殑鏁板€?*銆?> 缁撹灞傞潰鐨勪笁浠朵簨涓嶅彉锛氬弻宄般€佷笌鏀瑰姩瀛楄妭鏁版棤鍏炽€佹墍浠ュ彧鑳芥寜鏈€鍧忔儏鍐典及銆?
## [1.12.1] 鈥?2026-10-31

鎶婁袱浠?鍙兘鍦ㄥ埆浜烘満鍣ㄤ笂楠?鐨勪簨锛岀敤鏈満鑳藉仛鐨勫姙娉曢獙鎺変簡锛涢『鎵嬭瘉浼簡鑷繁鍐欑殑涓€鏉℃枃妗ｃ€?
### 宸查獙璇侊紙涓嶅啀鏄?鏈獙璇?锛?
1. **鐪?pnpm 瀹夎璺緞**銆傛柊寤轰竴涓?profile 璺?   `dsh plugin --profile verify-add add github:qwq1223211/dsh-minimal-router`锛?   鐪熺殑浠?GitHub 鎷変笅鏉ャ€乸npm v11 纭摼杩?`node_modules/@local/dsh-minimal-router`锛?   **34 涓枃浠剁殑鐪熷疄鐩綍**锛堜笉鏄?link锛夛紝`lib/` 12 涓枃浠堕綈鍏ㄣ€?   浠庨偅閲?`import` 鎴愬姛銆乣apply` 娉ㄥ唽 10 涓伐鍏枫€?*鍖呯洰褰曢噷娌″鍑轰换浣曟枃浠?*銆?   鍐欑洏璺緞鍦?`~/.dsh/minimal-router/`銆?2. **鏃х増鏁版嵁鎼**銆俙test/migration.test.mjs`锛? 椤癸紝杩?CI锛夛細缁欏瓙杩涚▼閲嶅畾鍚?   `HOME`/`USERPROFILE`锛屾惌鍑虹湡瀹炵殑鏃у竷灞€锛堝寘鐩綍閲屽甫 `data/usage.jsonl`锛夛紝
   浠庢棫鍖?import 鈫?鏂█鏁版嵁钀藉埌 `~/.dsh/minimal-router/`銆?*7 鏉′竴鏉′笉灏?*銆?   閲嶅鍔犺浇涓嶈鐩栵紙骞傜瓑锛夈€?
### 淇浜嗕竴鏉￠敊璇殑鏂囨。

鎴戜箣鍓嶅湪 README 閲屽啓"`dsh plugin add` 瑁呭畬鍙兘杩樿鎵嬪姩鍚敤 bundle"鈥斺€?*閿欑殑**銆?瀹炴祴锛欴SH 浼氭妸鍖呭悓鏃跺啓杩?profile 鐨?`dependencies` **鍜?* `dsh.profile.bundles`锛?骞惰嚜鍔ㄥ垵濮嬪寲 profile銆傛墍浠ユ甯告儏鍐典笅瑁呭畬鍙渶瑕併€屽叧鎺夊啀鎵撳紑銆嶃€?
### Added

- **`scripts/verify-installed.mjs`**锛氳瀹屼箣鍚庝竴鏉″懡浠ゅ鏍歌繖浠藉畨瑁呫€?  妫€鏌ユ枃浠堕綈鍏ㄣ€佸叆鍙ｅ彲 import銆乣inject` 鍙緷璧?tools銆佸啓鐩樿矾寰勫湪鍖呭銆?  `apply` 涓嶅線鍖呯洰褰曞啓鏂囦欢銆?0 涓伐鍏烽兘娉ㄥ唽涓娿€?- `docs/VERIFY.md` 琛ヤ笂"鍝簺宸茬粡楠岃繃銆佺敤浠€涔堝姙娉曢獙鐨?锛岄伩鍏嶄笅娆￠噸澶嶅姵鍔ㄣ€?
**281 椤规祴璇?*锛坮outer 177 + guard 21 + probe 31 + fuzz 12 + instrument 28 +
install-elsewhere 8 + migration 4锛夛紝琛岃鐩栫巼 90.32%銆?
## [1.12.0] 鈥?2026-10-31

瑕嗙洊鐜囦粠"涓嶇煡閬?鍙樻垚"**90.32% 琛岃鐩栵紝CI 瀹堜綇 85%**"鈥斺€旇€屼笖鏄敤 Node 鍐呯疆鐨?V8 coverage 绠楃殑锛?**娌℃湁瑁?c8 / istanbul**锛堢户缁浂渚濊禆锛夈€?
### Added

- **`scripts/coverage.mjs`**锛氶浂渚濊禆琛岃鐩栫巼銆傝 `NODE_V8_COVERAGE` 璺?6 涓浠讹紝
  鑷繁鎶娿€屽亸绉诲尯闂?+ 鎵ц娆℃暟銆嶆槧灏勫洖琛屽彿銆傛敮鎸?`--json` 鍜?`--min <闃堝€?`锛圕I 鐢級銆?- **`test/instrument.test.mjs`锛?8 椤癸級**锛氫笓娴?閲忓昂瀛愭湰韬?銆?  瑕嗙洊鐜囩粺璁℃毚闇插嚭鏈」鐩渶璁藉埡鐨勪竴鐐光€斺€?*鎵€鏈夊澶栨暟瀛楃殑鏉ユ簮瑕嗙洊鐜囨渶浣?*锛?  `probe-core` 30%銆乣probe-store` 38%銆乣guard` 50%銆?  鐜板湪杩欏嚑涓ā鍧楀垎鍒埌浜?**94.6% / 83.6% / 86.8%**銆?  瑕嗙洊鐨勫绾﹀寘鎷細`fnv1a` 绋冲畾鎬с€乣safeStringify` 姘镐笉鎶涖€乣describeRequest` 鐨?prefixSig銆?  `makeRecord` 涓嶄骇鐢?`undefined` 瀛楁銆乣summarize` 涓嶄骇鐢?NaN銆乣wrapStream` 鍘熸牱閫忎紶涓斾笉鍚炲紓甯搞€?  瀛樺偍鐨勫潖琛岃烦杩囦笌杞浆銆佺啍鏂殑闃堝€?娓呴浂/浼氳瘽闅旂/閫冪敓闂ㄣ€?- CI 鏂板 `coverage` job锛坲buntu锛岄槇鍊?85%锛夛紱鍙戠増闂ㄧ涔熷姞涓婁簡瀹冦€?
### 杩囩▼涓嚜宸辩姱鐨勪袱涓敊锛堥兘鍐欏湪浠ｇ爜娉ㄩ噴閲岋級

1. **鍗曡繘绋嬪唴鐢ㄥ苟闆?鈫?鍋囩殑 100%**锛歏8 鐨勫尯闂存槸**宓屽鏈夊簭**鐨勶紝椤跺眰"鏁翠釜鏂囦欢 count=1"浼氭妸
   鏈墽琛屽垎鏀叏鏌撴垚宸茶鐩栥€傚繀椤?鍚庤€呰鐩栧墠鑰?銆?2. **璺ㄨ繘绋嬩篃鐢ㄨ鐩?鈫?鍋囩殑 35%**锛氬悓涓€鏂囦欢琚涓祴璇曡繘绋嬪姞杞斤紝鍚勮鐩栦竴閮ㄥ垎锛?   鏈€鍚庡鐞嗙殑杩涚▼锛堣鐩栨渶灏戯級鎶婂墠闈㈢殑鎶规帀浜嗐€傚繀椤?*璺ㄨ繘绋嬪彇骞堕泦**銆?
**涓ゅ眰璇箟蹇呴』鍒嗗紑**锛屾贩鐢ㄥ湪涓や釜鏂瑰悜涓婇兘浼氱粰鍑洪敊璇暟瀛椼€?
### 鐜扮姸

**277 椤规祴璇?*锛坮outer 177 + guard 21 + probe 31 + fuzz 12 + instrument 28 + install-elsewhere 8锛夛紝
琛岃鐩栫巼 **90.32%**锛?649/4040锛夈€?
## [1.11.0] 鈥?2026-10-31

銆屽彧鍦ㄥ埆浜烘満鍣ㄤ笂鎵嶇偢銆嶈繖涓€绫婚棶棰樼殑绯荤粺鎬ф敹鍙ｃ€傛瘡涓€椤归兘鏈夋祴璇曟垨浣撴瑕嗙洊锛屽苟鎸傝繘浜?CI銆?
### Corrected锛堟垜涔嬪墠璇撮敊浜嗕袱澶勶級

1. **"`engines.dsh` 蹇呴』鏄簿纭€?鏄敊鐨勩€?* 浠?`app.asar` 閲屾寲鍑?`@deepseek-ai/dsh-app-boot`
   鐨勭湡瀹炲疄鐜帮細瀹冭皟鐢?`semver.satisfies(runtimeVersion, range, { includePrerelease: true })`鈥斺€?   **鏄寖鍥村垽瀹?*銆?2. **"甯﹂鍙戝竷涓嬬晫鐨勮寖鍥翠笉鍖归厤鍒殑鐗堟湰鐨勯鍙戝竷"涔熸槸鎴戣閿欑殑銆?* 鍥犱负浼犱簡
   `includePrerelease: true`锛宍>=0.2.1-rc.4` 鍚屾牱鍖归厤 `0.3.0-rc.1`銆?   杩欐潯鎴戝湪 v1.4.0 鐨?CHANGELOG 閲屽啓鍙嶄簡锛岃繖閲屾洿姝ｃ€?
### 鏂板彂鐜扮殑涓€涓湡闄烽槺

`range.trim() !== "" && semver.satisfies(...)` 鈥斺€?**绌哄瓧绗︿覆浼氳鍒や负"涓嶆弧瓒?**锛?浜庢槸 `engines.dsh: ""` 浼?*鐩存帴鎷︿綇瀹夎**銆備互鍓嶆病浜烘彁杩囷紝鐜板湪浣撴浼氭姤閿欍€?
### Added

- **`scripts/audit-deps.mjs`**锛? 椤癸紝澶辫触閫€鍑虹爜 1锛屽凡鎸?CI锛夛細
  闆跺閮ㄤ緷璧栥€乣main`/`exports` 涓€鑷淬€乣type: module`銆?  **`files` 鏄惁瑕嗙洊"杩愯鏃剁湡姝ｄ細 import 鐨勬枃浠?锛堥€掑綊瑙ｆ瀽 import 鍥撅級**銆?  `inject` 涓嶅惈 `systemPrompt`銆乣engines.dsh` 鍚堟硶锛堝惈绌轰覆闄烽槺锛夈€?  鍐欑洏璺緞鍦ㄥ寘澶栥€?*娌℃湁浠讳綍鍐欐搷浣滄寚鍚戝寘鍐呰矾寰?*锛坧npm store 鍙兘鍙锛夈€?- **`test/install-elsewhere.test.mjs`**锛? 椤癸級锛氬彧鎸?`package.json` 鐨?`files`
  澶嶅埗涓€浠藉埌 `tmpdir/node_modules/.pnpm/<hash>/...`锛屼粠閭ｉ噷闈?import 骞?`apply()`銆?  鏂█锛氬叆鍙ｅ彲鍔犺浇銆乣STATE_DIR` 浠嶅湪鐢ㄦ埛鐩綍銆佸唴缃ず渚嬭窡鐫€鍖呰蛋銆?  6 涓矾鐢卞伐鍏?+ 鐔旀柇 + 鎺㈤拡鍏ㄩ儴娉ㄥ唽銆?*apply 涔嬪悗瀹夎鐩綍閲屼笉澶氬嚭浠讳綍鏂囦欢**銆?  缂?`systemPrompt` 鏃朵粛鑳藉姞杞姐€?- CI 鏂板 `audit-deps` 涓?`install-elsewhere` 涓ゆ锛堜粛 3 骞冲彴 脳 2 涓?Node 鐗堟湰锛夈€?- `CONTRIBUTING.md` 鍐欐槑杩欎簺妫€鏌ヤ负浠€涔堝瓨鍦ㄣ€佷互鍙婂摢浜涙槸鏈満**楠岃瘉涓嶄簡**鐨勩€?
### 涓轰粈涔堣繖绫?bug 鍊煎緱鍗曠嫭绔嬮」

瀹冩湁涓€涓叡鍚岀殑浼锛?*鍦ㄦ湰鏈?link 瀹夎鏃?100% 姝ｅ父**銆?鏁版嵁鍐欏湪鍖呴噷銆佸皯鍒椾竴涓?`files` 鏉＄洰銆佺‖渚濊禆鏌愪釜鏈嶅姟鈥斺€旇繖涓変欢浜嬪湪寮€鍙戣€呮満鍣ㄤ笂姘歌繙鐪嬩笉鍑洪棶棰橈紝
鍙湁鍒板埆浜烘満鍣ㄤ笂鎵嶇偢锛岃€屼笖寰€寰€涓嶆姤閿欍€佸彧鏄?娌℃晥鏋?銆?
**249 椤规祴璇?*锛坮outer 177 + guard 21 + probe 31 + fuzz 12 + install-elsewhere 8锛夈€?
## [1.10.0] 鈥?2026-10-31

宸ョ▼鍖栨敹鍙ｏ細鎶?鑳界敤鐨勬彃浠?鍙樻垚"鍒汉鏁緷璧栫殑浠撳簱"銆?
### Added

- **妯＄硦娴嬭瘯**锛坄test/fuzz.test.mjs`锛?2 椤?/ 绾?8400 涓‘瀹氭€ч殢鏈鸿緭鍏ワ級銆?  鐢?mulberry32 鍥哄畾绉嶅瓙锛岄殢鏈哄杺鎺у埗瀛楃銆佷唬鐞嗗銆乪moji銆侀浂瀹藉瓧绗︺€佹瀬绔暟鍊笺€?  鏂█鐨勪笉鍙橀噺锛氳В鏋愬櫒**缁濅笉鎶涘紓甯?*銆佽繑鍥炲€兼案杩滄槸**鏃犳崯 JSON**銆?  鎻愮ず姘歌繙 鈮?00 瀛椼€乣tagOf` 姘歌繙杩斿洖闈炵┖灏忓啓鏍囩銆?  **閫冪敓闂ㄥ湪浠绘剰闅忔満闃舵琛ㄤ笅閮戒笉浼氳閿佹**銆佹垚鏈及绠楁案涓嶅嚭鐜?NaN/Infinity銆?- **浠撳簱鑷**锛坄scripts/lint.mjs`锛夈€備笓娌绘湰椤圭洰琚潙杩囦袱娆＄殑鐥咃細
  BOM / U+FFFD / UTF-8鈫扜BK 涔辩爜涓?/ CRLF銆乣package.json` 鐨?main-exports 涓嶄竴鑷淬€?  `files` 澹版槑缂哄け銆佸簱浠ｇ爜寰€ stdout 鎵?`console.log`銆乣index.js` 浣撶Н瀹堝崼銆?- **娴嬭瘯鑴氭墜鏋?*锛坄test/harness.mjs`锛夛細4 涓祴璇曟枃浠跺叡鐢ㄤ竴浠斤紝杈撳嚭鏍煎紡涓嶅彉銆?- **鏂囨。**锛歚docs/ARCHITECTURE.md`锛堟ā鍧楀垎灞傘€佷細璇濈姸鎬佽〃銆佷竴娆¤姹傜粡杩囩殑鎵€鏈夐挬瀛愩€?  鍥涙潯涓嶅彲鐮寸殑绾︽潫锛夈€乣CONTRIBUTING.md`锛堟彁浜ゅ墠鑷煡銆佹灦鏋勭害瀹氥€佹€庝箞鍔犲伐鍏凤級銆?  `SECURITY.md`锛堟敾鍑婚潰鍙湁涓変欢浜嬶紝浠ュ強鎴戜滑鏄庣‘涓嶅仛鐨勪簨锛夈€乮ssue 妯℃澘銆?- CI 澧炲姞 `fuzz` 鍜?`lint` 涓ゆ锛堜粛鏄?3 骞冲彴 脳 2 涓?Node 鐗堟湰锛夈€?
### Changed

- **`index.js` 1563 鈫?1493 琛?*锛氫笁涓交閲忓伐鍏风殑瀹氫箟鎼埌 `lib/tools-dynamic.js`锛堜緷璧栨敞鍏ワ紝
  鐘舵€佹搷浣滀粛鐣欏湪瑁呴厤灞傦級锛涘唴缃ず渚嬬殑璇诲彇鎼埌 `lib/stages-config.js`锛坄listPresets` / `readPreset`锛夈€?  浣撶Н瀹堝崼鍥犳閲嶆柊涓婄嚎銆?- `lib/probe.js` 鐨?`console.log` 鈫?`console.info`锛氬簱浠ｇ爜涓嶈寰€ stdout 姝ｅ紡杈撳嚭閲屾彃琛屻€?
### 鐜扮姸

**241 椤规祴璇?*锛坮outer 177 + guard 21 + probe 31 + fuzz 12锛夛紝闆惰繍琛屾椂渚濊禆銆?
## [1.9.0] 鈥?2026-10-31

The four items from a self-audit: one bug that could burn money with a single sentence, three
data-driven refinements, and a regression baseline so the savings cannot silently rot.

### Fixed 鈥?negation was read as a command (P0)

`isExplicitSwitch("鍒垏鍒扮編鏈?)` returned **true**. Since an explicit command bypasses both the hysteresis
and the cost gate, a user saying **"don't switch to art"** would switch immediately 鈥?at full price, in the
most expensive session. Same for `涓嶈鍒囨崲鍒?art`, `鍏堜笉鍒囧埌 core`, `don't switch to art`.

A negation immediately before the switch phrase now cancels it; a sentence containing both
(`"鍒垏鍒扮編鏈紝鍒囧埌 core"`) still counts as a command. 4 tests.

### Changed 鈥?hysteresis numbers now come from data (P0)

Analysed the gaps between **88 real switches** (`_tools/analyze-switch-gaps.mjs`):

| | gap |
|---|---|
| P25 | 2.0 s |
| median | 9.0 s |
| P75 | 81.1 s |
| P90 | 433 s |

**43% of adjacent switches happened within 5 s, 71% within 60 s** 鈥?that is the flapping, quantified.

- `switchCooldownMs` **120 s 鈫?60 s**: covers the 鈮?0 s flapping mass without making real task switches wait
  an arbitrary two minutes.
- New `switchConfirmWindowMs` (**5 min**, above measured P75): two keyword signals further apart than this are
  a new task, so the confirmation count restarts. Previously "two consecutive signals" had no time bound 鈥?the
  same word an hour later still counted as a confirmation.

### Changed 鈥?cost gate knobs are configurable (P1)

`switchCostRatio` (default 1.0 = worst case) and `switchSavingsPerByte` (default 0.3, measured) were hard-coded.
Both are now config, exposed in `route_status.switchEconomics`. The measured average miss ratio is 0.465, so
anyone who finds the worst-case assumption too conservative can say so explicitly.

### Changed 鈥?the "installed but saves nothing" case now speaks up (P1)

`stageTableUnused` used to exist only inside `route_status` 鈥?you had to ask to find out you were wasting a
plugin slot. Now the first time a stage finds nothing to trim, a one-time console message explains the three
ways to fix it (preset / scan / `strict`).

### Added 鈥?integration tests and a savings baseline (P2)

- The fake runtime already modelled `restrict()` faithfully (visible schemas shrink and restore), so the
  integration assertions are real: switching to `core` leaves **6 of 13** tools with no `unity_*` present;
  switching back to `auto` **restores every tool** 鈥?the test that would have caught the
  dispose-before-compute ordering bug.
- A **byte-level savings baseline** per stage (core 54.2%, audio 46.3%, art 38.7%, unity-code 23.2%) asserts
  that trimming never regresses. A stage-table change that saves less now fails CI.

7 new tests: router 162 鈫?**177**; **229 total**.

## [1.8.0] 鈥?2026-10-30

Six failure modes that had never been tested, closed with 7 tests, a CI matrix, and one real fix.

### Fixed

- **Multi-agent state could collide.** `keyOf()` fell back to a single shared `'__global__'` slot for any
  agent without an `id`. Two windows (or two anonymous subagents) would then share one stage, one dynamic
  grant and one hint switch 鈥?"A switches stage and B's tools get trimmed". Anonymous agents now get a unique
  key from a `WeakMap`.

### Tested (previously unverified scenarios)

| Scenario | Result |
|---|---|
| Two agents alternating `route_stage` | Isolated stage, dynamic grant and hint switch 鈥?**test added** |
| Two anonymous agents (no `id`) | Isolated **(this is the fix above)** |
| `tools.restrict()` throws | Stage still switches; the reason is reported as `error:鈥, not swallowed |
| Downstream `llm/stream` throws (429 / network) | Earlier chunks pass through, the error propagates unchanged; nothing hangs |
| 10 malformed stage configs (string, number, Chinese punctuation, junk arrays, 鈥? | No throw; always a structured `{ ok, errors }` |
| 4 broken JSON files (truncated, Chinese punctuation, BOM, empty) | No throw |
| Another plugin denies in `pre-execute` | Our plugin calls `next()`, the other plugin's denial wins |

### CI

The matrix now runs **ubuntu / macos / windows 脳 node 20 / 22** (6 jobs), plus a dedicated cross-platform
job asserting that the data directory is the user's home and that a **Chinese + space** path loads. Windows
alone was not evidence; this is a plugin for other people's machines.

### Docs

README now states the coexistence boundaries: safe with other `pre-execute` plugins (we always `next()`),
recommended with `/trim`, **incompatible** with a second tool router, and bisect advice for a message gate.

## [1.7.0] 鈥?2026-10-30

The tail hint gets a runtime switch, and its cost gets measured instead of argued about.

### Added

- **`route_hint({ enabled })`** 鈥?turn the tail hint on or off **for the current session only**, at runtime, no
  reload. `route_hint()` with no argument just queries. Added to `ALWAYS_ALLOW`, so it survives even the
  narrowest `route_use` narrowing. This exists so anyone can A/B the hint on their own machine instead of
  trusting either side of the argument.
- 4 new tests (router 154; **210 total**).

### Measured: what the hint actually costs

Rendered with the real default stage table (`_tools/hint-cost.mjs`, deterministic 鈥?no sampling):

| stage | chars | ~tokens |
|---|---|---|
| auto | 71 | ~50 |
| core | 117 | ~82 |
| audio | 120 | ~84 |
| art | 138 | ~97 |
| unity-ui | 151 | ~106 |
| unity-code | 180 | ~126 |

Against a real request (137,790 bytes of tool declarations, ~900,000 tokens of context): the hint is
**0.09% of the tool declarations** and **0.01% of the context**.

Conclusion: "the injected hint is itself a cost problem" is arithmetically false. The only open question was
its **behavioural** effect, which is what the A/B below tests.

### A/B result: the old hint actively hurt, and it is fixed

Two brand-new sessions, identical task, the only difference being the hint:

| | No hint (arm B) | Hint on (arm A) |
|---|---|---|
| `unity_object_create` (forbidden in stage `art`) | **called it** | never called it |
| What came back | routing denial listing the exact fix: `璇风珛鍗宠皟鐢?route_stage("unity-code")` | 鈥?|
| Recovery | **switched stage, then called it again** | **gave up** ("not in my tool list") |

The old hint printed `绂佹缁?audio,dialogue,enemy,gameplay,l10n,level,lighting,perf 绛?5缁刞 鈥?and because the
list was truncated to 8 names, `unity` **was hidden inside "绛?5缁?**. The model read "all these are banned",
decided the task was impossible, and stopped. The model **without** the hint just tried, received a denial
that named the tool, the current stage, the allowed groups and the exact call to make, and recovered.

So the hint was competing with the denial message and losing: the denial is precise, the truncated ban list
is not. The hint now lists **only the allowed groups** plus one universally correct escape
(`route_stage("auto")`), and shrank from 193 chars to 68鈥?5 chars for typical stages.

Caveat stated plainly: this is n=1 per arm. It is enough to show the old wording could induce giving up, not
enough to quantify a rate. `route_hint` exists so anyone can repeat it with more samples.

## [1.6.0] 鈥?2026-10-30

The zero-config path: task-driven narrowing without a stage table.

### Added

- **`route_use({ groups, turns })`** 鈥?narrow the visible tool set to the named groups (plus base tools and the
  escape hatch) for `turns` user turns (default 3, max 20), then restore automatically. `groups: []` releases
  immediately. Group names are the tags `route_status` already derives from tool names, so **no
  `custom_stages.json` is involved**. This answers "the plugin requires you to predefine your workflow": you
  no longer have to.
- `route_status` reports `dynamicGroups` / `dynamicTurnsLeft`; `route_stage` and `route_reset` clear any
  dynamic grant so the two mechanisms cannot shadow each other.
- 5 new tests (router 145 鈫?150; **202 total**), including one that asserts `route_use` and the probe tools
  survive being narrowed.

### Deliberately not implemented: a per-turn judging model

The review proposed deciding each turn's tool set with a small classifier. That is one extra request per
turn with the entire context re-sent at full price. Measured on this project, 99.9% of the tokens the plugin
saves are cache-priced 鈥?so paying one full-price request to save cheap tokens is a net loss. The judgement
stays with the model already in the context (`route_use`), which costs nothing extra.

### Also not implemented, and why

- **Defer-loading catalog anchors**: our tail hint already names the allowed and forbidden groups, capped at
  `hintMaxChars`. A second catalog block would spend prompt space to describe tools that are not in the
  prompt 鈥?the opposite of the goal.
- **Implicit LLM-generated grouping**: `route_init` already derives groups from tool names deterministically
  and offline; an LLM pass would add latency and a failure mode to a step that has neither.
- **Budget tiers**: worth revisiting only once switching cost is stable enough to model, which 1.2.0 showed it
  is not (bimodal: 0.2鈥?.2% vs 98鈥?9% of context).

## [1.5.0] 鈥?2026-10-30

Two things from a review of the ecosystem's failure modes: one real lockout bug, one cache-stability lever.

### Fixed

- **`cache_probe_report` / `cache_probe_clear` were missing from `ALWAYS_ALLOW`.** With `strict: true` (added
  in 1.3.0) the deny rule also covers unclaimed tags 鈥?and the probe tools are tagged `cache`, which no stage
  claims. So enabling strict mode **hid the diagnostic tools themselves**, and the user could no longer see
  any number explaining why nothing was being saved. That is precisely the "control plane hides itself, 221
  tools locked, no way out" anti-pattern reported for another router. The escape hatch is now checked before
  every rule, probe tools included.

### Added

- **`accumulateDisclosure`** (default `false`) 鈥?once a tool group has been visible in this session, it stays
  visible; the tool list only grows, so consecutive switches differ less and the prefix cache is more stable.
  Trade-off: trimming weakens as the session goes on, which is why it is opt-in. `route_reset` clears the
  accumulated set so you can return to strict trimming.
- The long-session warning now also suggests running `/trim` (if `dsh-command-context-trim` is installed)
  before switching, alongside "start a new session".
- 5 new tests (router 140 鈫?145; **197 total**), including one that asserts the probe tools survive strict mode.

### Notes on the review this came from

Several of its items were already shipped and are confirmed here rather than re-implemented: tail injection
already goes through `systemPrompt.context()` (not the system prompt 鈥?`prefixSig` stays constant across
stage switches), the soft pre-warning at 80% of the gate landed in 1.4.0, bundled domain presets landed in
1.4.0, and the "unknown is visible" default has been the design since 1.0.0.

## [1.4.0] 鈥?2026-10-30

Three onboarding and long-session improvements, plus a correction to a claim that was circulating about
this package.

### Corrected

- **The version requirement is a range, not an exact value.** `engines.dsh` is `>=0.2.1-rc.4`; a guide in
  circulation told users it must match the host exactly. That is false. (One real caveat *does* apply:
  semver ranges with a prerelease floor cover later **releases** such as `0.2.2`/`0.3.0`, but not a
  prerelease of a different tuple such as `0.3.0-rc.1`.)

### Added

- **`examples/` presets** 鈥?`python-data`, `web-dev`, `writing`, `qq-chat`. Run
  `route_init({ "preset": "python-data" })` and it writes a ready-to-use `custom_stages.json` directly,
  instead of making every new user start from the raw scan. No more "Unity template or nothing".
- **`hintMaxChars`** (default 200, floor 40) 鈥?the tail hint was always capped at a constant; it is now
  configurable, for people who would rather have a terser prompt.
- **Proactive long-session warning** 鈥?at `contextGuardWarnRatio` (default 0.8) of the safety-gate threshold
  the plugin prints a one-time console notice telling you to start a new session, instead of staying quiet
  until a stage switch is refused.
- 4 new tests (router 136 鈫?140; **192 total**).

## [1.3.0] 鈥?2026-10-30

Five fixes from a **real deployment on another machine** (different provider, different tool set, no Unity
at all). Every one of them was a silent failure 鈥?the plugin looked installed and reported no error.

### Fixed

- **`trustedModels` only matched a bare model id.** A config written as `bailian/deepseek-v4.1-flash-1017`
  never matched `options.model` (`deepseek-v4.1-flash-1017`), so the user "enabled" it and stayed degraded
  without any error. Model names are now normalised on both sides (trim, lowercase, strip `provider/`), and
  the known-capability lookup uses the same normalised name.
- **`custom_stages.json` silently rejected the array form.** `{ "stages": [ { "stage": "chat", ... } ] }` is
  the shape most people write by hand; the validator only accepted an object map, so the whole file was
  discarded as invalid. Both shapes are accepted now.
- **A stage table that matches nothing trimmed 0 bytes, silently.** If none of the claimed tags exist in the
  current environment (e.g. a machine with only QQ tools and no Unity), the deny list is always empty. That
  looked like "installed but saves nothing" with no diagnostic. `route_status` now reports
  `stageTableUnused` + `stageTableHint`.
- **No way to trim unfamiliar tools at all.** Added per-stage `strict: true`: it also denies tags that no
  stage claims, which is the only way to save anything on a tool set the built-in table knows nothing about.
  Default stays `false` ("never block the unknown").

### Added

- A one-time console notice when a model is allowed via `trustedModels`, stating plainly that this is the
  **user's assertion, not a measurement**, and how to verify it (`prefixChanges` / `hitRate` after 3 turns).
- 8 new tests (router 128 鈫?136; **188 total**).

## [1.2.1] 鈥?2026-10-30

Two dependency/entry robustness fixes, found by auditing the package the way a fresh install would see it.

### Fixed

- **Runtime data no longer lives inside the package.** The probe wrote to `<package>/data/usage.jsonl` and
  `route_init` wrote `custom_stages.sample.json` next to the package. That is fine for a `link:` install and
  **broken for a real dependency install**, where pnpm places the package under `node_modules/.pnpm/<hash>/` 鈥?  a directory that is replaced on upgrade and may not even be writable. Both now default to
  `~/.dsh/minimal-router/`, and the existing probe history is copied over once on first run.
- **`systemPrompt` is no longer a hard dependency.** `inject` was `['tools', 'systemPrompt']`, so on any host
  or preset that does not provide `systemPrompt`, the *entire* plugin failed to load 鈥?taking the circuit
  breaker and the probe down with it. It is now resolved optionally: without it, only the tail hint is
  disabled (with a console explanation), while out-of-stage denial, dead-loop lint, the breaker and the probe
  keep working. `route_status` reports `hintAvailable`.

### Verified by audit

Zero external imports (only `node:` builtins and relative files), `main` and `exports["."]` agree, every entry
in `files` exists, and the package imports cleanly and exposes `apply` + `inject`.

## [1.2.0] 鈥?2026-10-30

Turns the "should we switch?" question into an economic calculation, using data mined from the
project's own probe history instead of intuition.

### Added

- **`lib/cost.js`** 鈥?`estimateSwitchEconomy()` / `decideByEconomy()` / `describeEconomy()`.
  Cost is estimated at the **worst case** (whole context at full price), savings at the measured
  **0.30 tokens per byte** of trimmed tool declarations.
- **Cost gate.** Automatic (keyword-driven) switches are refused when
  `paybackTurns > switchPaybackTurns` (default **3**). Explicit commands are exempt.
- `route_status` now reports `switchEconomics`: per-stage cost, per-turn saving, payback and verdict.
  `route_stage` returns the same numbers for the stage it just switched to.
- 10 new tests (router 113 鈫?123; **175 total**).

### Findings that shaped this (kept here because they are counter-intuitive)

From 615 probe records / 60 prefix changes:

| Type | Count | Share of context that missed |
|---|---|---|
| Cheap | 35 | 0.2% 鈥?1.2% |
| Catastrophic | 11 | 98% 鈥?99% |

Cost does **not** correlate with how much changed: a **98,778-byte** tool-list change cost 708 tokens,
while a **481-byte** change cost **581,830**. The mean (46.5%) is meaningless for a bimodal
distribution, which is exactly why the estimate is worst-case rather than average.

## [1.1.0] 鈥?2026-10-30

Attacks v1.0.0's biggest risk: a stage switch costs anywhere from **3,205** to **513,857**
full-price tokens (same action, 160脳 difference depending on context size). This release makes
switching rarer, and makes version failures readable.

### Added

- **Switch hysteresis.** Keyword-driven stage changes now need `switchConfirmations` (default **2**)
  consecutive signals pointing at the same stage, plus a `switchCooldownMs` (default **120 s**) cooldown
  after every switch. Explicit commands ("switch to core", "鍒囧埌缇庢湳闃舵") still apply on the first message.
  Motivation: one stray mention of "UI" inside a Unity task used to trigger a real prefix rebuild.
- **`engines.dsh: ">=0.2.1-rc.4"`** 鈥?an incompatible host now produces a readable install error
  instead of a cryptic load failure.
- `route_status` reports `switchArbiter` (pending stage/count, cooldown remaining) and
  `lastArbiterDecision`, so "why didn't the stage change?" has an answer.
- 8 new tests (router 105 鈫?113; **165 total** across the three modules).

### Changed

- **Behaviour change:** a single keyword mention no longer switches the stage. Send a second confirming
  message, or say it explicitly. Set `switchConfirmations: 1` to restore the old behaviour.
- The README install section now marks the *disable 鈫?enable* step as mandatory and names the failure mode
  ("looks installed but does nothing").

## [1.0.0] 鈥?2026-10-30

First public release. Built and measured on a real DSH profile with 40+ plugins.

### Added

- **Stage-based routing.** Six built-in stages (`auto`, `core`, `unity-code`, `unity-ui`, `art`, `audio`).
  Stage is chosen by priority: explicit `route_stage` > message keywords > sticky previous > default.
- **Zero-config auto-classification.** Tool tags are derived from names:
  `unity_object_create` 鈫?`unity`, `mcp__meshy__meshy_image_to_3d` 鈫?`meshy`,
  base tools from an explicit `DEFAULT_CORE_TOOLS` list (so `create_goal` is not mistaken for a `create` group).
- **Tail-only routing hint.** Injected through `systemPrompt.context()`, hard-capped at 200 characters,
  so the cached prefix is untouched.
- **Physical trimming.** `enforceByRestrict` removes out-of-stage tools from the request through
  `agent.ctx.tools.restrict()`. Measured: 165 鈫?69 tools, 131,694 鈫?48,837 bytes.
- **Out-of-stage denial.** `tools/pre-execute` rejects cross-stage calls with an imperative message
  naming the stage to switch to.
- **Dead-loop lint.** `while(true)` / `for(;;)` / `do{}while(true)` are rejected before a write-like tool runs,
  but only when the loop body has no `break`/`return`/`throw`. Comments and string literals are stripped first.
  Self-recursion without a conditional is reported as a warning, never blocked.
- **Escape hatches.** `route_*` and `guard_*` are always allowed, in both this plugin and `dsh-minimal-guard`.
- **Degradation guard.** Detects models without `systemPromptUpdate: 'in-history'` and disables the tail hint
  and trimming, keeping deny + lint. Unknown models degrade by default. Boxed one-time warning.
  Escape hatches: `trustedModels`, `unsafeForce`.
- **`simulateModel`.** Pretend to run on another model 鈥?demo the degradation warning without paying for it.
- **Context safety gate.** When the last request exceeded `contextGuardThreshold` (default 100,000 tokens),
  `route_stage` is refused unless `force: true`, and **keyword-driven auto-switching is suppressed too**,
  because a stage switch at that size costs a full prefix rebuild. Measured: 512k tokens rebuild (~1.2% hit rate).
- **Universal adaptation.** `custom_stages.json` (validated, merged over built-ins, malformed files ignored with a
  warning) and `route_init()`, which generates a template from the tools actually installed.
- **Chinese and English READMEs**, zh/en locale metadata, icon.

### Fixed during development (kept here on purpose)

- Keyword matching used substring search, so `uikit` triggered the `ui` stage. ASCII keywords now match on word boundaries.
- An explicit stage was wiped by the next unrelated message ("switch once, usable for one turn"). Stages now stick;
  only a keyword hit, `route_stage`, or `route_reset` changes them.
- The tool-count reported by `route_status` ignored `restrict()` (153 vs the real 35), which made trimming look inactive.
- A denied call was counted as a **new** error by the circuit breaker (3 became 4).
- The context safety gate only covered `route_stage`; a keyword auto-switch in a 780-message session
  bypassed it and cost a 512k-token full rebuild (1.2% hit rate). Keyword switching now passes the same gate.

### Measured reference numbers

| Metric | Value |
|---|---|
| Tools advertised (auto 鈫?core) | 165 鈫?66 |
| Tool declaration bytes | 131,694 鈫?43,238 (鈭?7.2%) |
| promptTokens per request (fresh session) | 47,885 鈫?25,688 (鈭?6.4%) |
| Cache hit rate while stable | 99.16% |
| One-time stage-switch cost (small session) | ~3,205 full-price tokens |
| One-time stage-switch cost (500k-token session) | ~512,000 full-price tokens |
| System prompt, long-lived session | 159,334 chars (9 appended copies) |
| System prompt, fresh session | 17,685 chars (1 copy) |

### Known limitations

- Tool trimming needs the agent-scoped context; a plain `ctx.tools.restrict()` call is refused by DSH by design.
- A stage switch still costs one prefix rebuild; the safety gate only stops you from doing it in a huge session.
- The built-in stage table happens to know Unity and Meshy because that is the author's own setup. Different domain? `route_init` scans *your* installed tools and hands you a ready-to-edit template 鈥?about a minute, and then routing is automatic. (The plugin deliberately never guesses: an unclaimed tool group is always allowed, because a wrong guess would block you mid-task.)
