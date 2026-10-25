// Caddy — Expo Go version. Paste into snack.expo.dev or open via the generated link.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------- Course: Watersound Club – The Third (par 71) ----------
const COURSE = {
  id: 'watersound-third',
  name: 'Watersound – The Third',
  pars: [4,4,3,4,5,3,4,3,5, 4,5,4,4,3,5,3,4,4],
  tees: {
    'Black':      [423,468,236,427,610,160,488,180,607, 398,542,435,426,169,572,170,364,463],
    'Black/Blue': [423,449,201,427,487,160,461,180,585, 398,542,435,395,169,556,156,347,428],
    'Blue/White': [400,430,157,410,487,136,434,170,537, 388,515,402,376,155,529,156,319,404],
    'White':      [377,430,157,377,464,136,434,160,537, 349,500,402,376,141,529,142,319,404],
    'White/Gold': [367,391,162,345,453,128,400,150,520, 363,500,346,362,142,490,123,275,406],
    'Gold':       [350,391,162,345,412,119,400,140,520, 334,477,346,362,119,490,123,275,375],
  },
  start: { latitude: 30.293, longitude: -85.975, latitudeDelta: 0.02, longitudeDelta: 0.02 },
};

// TJ's bag from shot tracker. 6i/7i both 179 — set which is longer. Wedges below PW are placeholders.
const DEFAULT_BAG = [
  { k:'Dr', name:'Driver', carry:290, bias:'10y R' },
  { k:'3W', name:'3 Wood', carry:243, bias:'6y L' },
  { k:'3i', name:'3 Iron', carry:226, bias:'8y R' },
  { k:'4i', name:'4 Iron', carry:212, bias:'4y R' },
  { k:'5i', name:'5 Iron', carry:201, bias:'6y R' },
  { k:'6i', name:'6 Iron', carry:189, bias:'6y R' },
  { k:'7i', name:'7 Iron', carry:176, bias:'8y L' },
  { k:'8i', name:'8 Iron', carry:167, bias:'4y L' },
  { k:'9i', name:'9 Iron', carry:149, bias:'4y L' },
  { k:'PW', name:'Pitching Wedge', carry:137, bias:'' },
  { k:'GW', name:'Gap Wedge', carry:120, bias:'' },
  { k:'SW', name:'Sand Wedge', carry:105, bias:'' },
  { k:'LW', name:'Lob Wedge', carry:85, bias:'' },
];

// ---------- Math ----------
const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
function yardsBetween(a, b) {
  const R = 6371000, dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.latitude))*Math.cos(toRad(b.latitude))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h)) * 1.09361;
}
function bearing(a, b) {
  const φ1=toRad(a.latitude), φ2=toRad(b.latitude), Δλ=toRad(b.longitude-a.longitude);
  const y=Math.sin(Δλ)*Math.cos(φ2), x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (toDeg(Math.atan2(y,x))+360)%360;
}
const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function relativeWind(w, shotBearing) {
  if (!w || w.mph < 3) return { dir:'calm', head:0, cross:0 };
  const windTo = (w.from + 180) % 360;
  const delta = ((windTo - shotBearing + 540) % 360) - 180;
  const along = w.mph * Math.cos(toRad(delta)), cross = w.mph * Math.sin(toRad(delta));
  const head = Math.round(Math.abs(along)), crossI = Math.round(Math.abs(cross));
  if (Math.abs(cross) > Math.abs(along) * 1.5) return { dir:'cross', head, cross:crossI };
  return { dir: along < 0 ? 'into' : 'down', head, cross:crossI };
}
function recommend(yards, c, bag) {
  const clubs = bag.filter(b => b.carry > 0).sort((a,b) => b.carry - a.carry);
  if (!clubs.length || yards <= 0) return null;
  const adj = []; let plays = yards;
  if (c.dir === 'into' && c.wind) { const a = yards*0.01*c.wind; plays += a; adj.push([`Wind into ${c.wind} mph`, a]); }
  if (c.dir === 'down' && c.wind) { const a = -yards*0.005*c.wind; plays += a; adj.push([`Wind down ${c.wind} mph`, a]); }
  if (c.elev) { const a = c.elev/3; plays += a; adj.push([`Elevation ${c.elev} ft`, a]); }
  const t = (c.temp - 70)/10; if (Math.abs(t) >= 1) { plays += -t; adj.push([`Temp ${c.temp}°F`, -t]); }
  const lieF = { fairway:1, tee:1, rough:0.92, sand:0.85 }[c.lie] ?? 1;
  if (lieF < 1) { const a = plays/lieF - plays; plays += a; adj.push([`Lie ${c.lie}`, a]); }
  const target = Math.round(plays);
  const reaching = clubs.filter(x => x.carry >= target);
  const pick = reaching.length ? reaching[reaching.length-1] : clubs[0];
  const idx = clubs.indexOf(pick), shorter = clubs[idx+1];
  let alt = null, note = `Stock ${pick.k} carries ${pick.carry}.`;
  if (shorter && Math.abs(target - (pick.carry + shorter.carry)/2) <= 4) { alt = shorter; note = `Tweener: smooth ${pick.k} or hard ${shorter.k}.`; }
  if (!reaching.length) note = `Longer than your longest club — lay up or accept the shortfall.`;
  else if (pick.carry - target >= 8 && shorter) note = `${pick.k} has ${pick.carry - target} yds in hand — take a little off.`;
  return { pick, alt, target, adj, note };
}

// ---------- Windy ----------
async function fetchWindy(coord, key, model) {
  const r = await fetch('https://api.windy.com/api/point-forecast/v2', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ lat:coord.latitude, lon:coord.longitude, model, parameters:['wind','windGust','temp'], levels:['surface'], key }),
  });
  if (!r.ok) throw new Error(`Windy ${r.status}`);
  const j = await r.json();
  const now = Date.now(); let i = 0;
  j.ts.forEach((t, k) => { if (Math.abs(t-now) < Math.abs(j.ts[i]-now)) i = k; });
  const u = j['wind_u-surface'][i], v = j['wind_v-surface'][i], K = j['temp-surface'][i], g = j['windGust-surface']?.[i];
  if (u == null || v == null || K == null) throw new Error('No forecast data');
  const mph = Math.sqrt(u*u+v*v)*2.23694; let from = toDeg(Math.atan2(-u,-v)); if (from < 0) from += 360;
  return { mph, gust: g != null ? g*2.23694 : null, from, tempF: (K-273.15)*9/5+32, at: Date.now(), warning: j.warning };
}

// ---------- App ----------
const KEY = 'caddy.v1';
export default function App() {
  const [tab, setTab] = useState('caddy');
  const [bag, setBag] = useState(DEFAULT_BAG);
  const [pins, setPins] = useState({});            // hole -> {latitude, longitude}
  const [hole, setHole] = useState(1);
  const [tee, setTee] = useState('White');
  const [scores, setScores] = useState({});        // hole -> strokes
  const [windyKey, setWindyKey] = useState('');
  const [model, setModel] = useState('namConus');
  const [loc, setLoc] = useState(null);
  const [heading, setHeading] = useState(null);
  const [weather, setWeather] = useState(null);
  const [wErr, setWErr] = useState('');
  const [manual, setManual] = useState('150');
  const [cond, setCond] = useState({ lie:'fairway', dir:'calm', wind:0, elev:0, temp:70 });
  const [autoWind, setAutoWind] = useState(true);
  const loaded = useRef(false);

  useEffect(() => { (async () => {
    try { const s = JSON.parse(await AsyncStorage.getItem(KEY) || 'null');
      if (s) { s.bag && setBag(s.bag); s.pins && setPins(s.pins); s.scores && setScores(s.scores); s.windyKey && setWindyKey(s.windyKey); s.model && setModel(s.model); s.tee && setTee(s.tee); s.hole && setHole(s.hole); }
    } catch {} loaded.current = true; })(); }, []);
  useEffect(() => { if (!loaded.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ bag, pins, scores, windyKey, model, tee, hole })).catch(()=>{}); }, [bag, pins, scores, windyKey, model, tee, hole]);

  useEffect(() => { let subL, subH; (async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    subL = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 1 }, p => setLoc(p.coords));
    subH = await Location.watchHeadingAsync(h => setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading));
  })(); return () => { subL?.remove(); subH?.remove(); }; }, []);

  const pin = pins[hole];
  const gpsYards = loc && pin ? Math.round(yardsBetween(loc, pin)) : null;
  const yards = gpsYards ?? (parseInt(manual) || 0);
  const shotBearing = loc && pin ? bearing(loc, pin) : heading;
  const eff = useMemo(() => {
    const c = { ...cond };
    if (autoWind && weather) { c.temp = Math.round(weather.tempF);
      if (shotBearing != null) { const r = relativeWind(weather, shotBearing); c.dir = r.dir; c.wind = r.head; }
      else { c.dir = weather.mph < 3 ? 'calm' : 'cross'; c.wind = Math.round(weather.mph); } }
    return c; }, [cond, autoWind, weather, shotBearing]);
  const rec = useMemo(() => recommend(yards, eff, bag), [yards, eff, bag]);

  async function refreshWeather() {
    if (!loc) return setWErr('Waiting for GPS…');
    if (!windyKey) return setWErr('Add a Windy Point Forecast key in Bag.');
    setWErr('Fetching…');
    try { setWeather(await fetchWindy(loc, windyKey, model)); setWErr(''); } catch (e) { setWErr(String(e.message || e)); }
  }
  function changeHole(d) { const h = Math.min(18, Math.max(1, hole + d)); setHole(h);
    if (weather && Date.now() - weather.at > 20*60*1000) refreshWeather(); }

  const toPar = Object.entries(scores).reduce((s,[h,v]) => s + (v - COURSE.pars[h-1]), 0);
  const played = Object.keys(scores).length;

  return (
    <SafeAreaView style={S.root}>
      {tab === 'caddy' && <ScrollView contentContainerStyle={S.body}>
        <View style={S.row}>
          <Btn onPress={() => changeHole(-1)} label="‹" />
          <View style={{ alignItems:'center' }}>
            <Text style={S.h2}>Hole {hole} · Par {COURSE.pars[hole-1]}</Text>
            <Text style={S.muted}>{tee} · {COURSE.tees[tee][hole-1]} yds</Text>
          </View>
          <Btn onPress={() => changeHole(1)} label="›" />
        </View>
        <Text style={S.big}>{yards}</Text>
        <Text style={S.muted}>{gpsYards != null ? 'yards to green center (GPS)' : pin ? 'waiting for GPS…' : 'no pin for this hole — manual'}</Text>
        {gpsYards == null && <TextInput style={S.input} value={manual} onChangeText={setManual} keyboardType="number-pad" placeholder="Manual yards" />}
        {loc?.accuracy ? <Text style={S.tiny}>GPS ±{Math.round(loc.accuracy*1.09)} yds</Text> : null}
        <View style={S.row}>
          <Btn label="Mark green here" primary onPress={() => loc && setPins({ ...pins, [hole]: { latitude: loc.latitude, longitude: loc.longitude } })} />
          <Btn label="Map pins" onPress={() => setTab('pins')} />
        </View>

        <View style={S.card}>
          <View style={S.row}><Text style={S.h3}>Wind · Windy</Text><Btn label="↻" onPress={refreshWeather} /></View>
          {weather ? <>
            <Text style={S.h2}>{Math.round(weather.mph)} mph from {COMPASS[Math.round(weather.from/22.5)%16]}{weather.gust ? ` · gusts ${Math.round(weather.gust)}` : ''} · {Math.round(weather.tempF)}°F</Text>
            {shotBearing != null ? <Text>{windText(relativeWind(weather, shotBearing))}</Text> : <Text style={S.muted}>Pin the green or point the phone at it to resolve head/tail.</Text>}
            {weather.warning ? <Text style={S.warn}>Windy trial key: data is shuffled. Paid key needed for real wind.</Text> : null}
            <Toggle on={autoWind} onPress={() => setAutoWind(!autoWind)} label="Auto-apply wind & temp" />
          </> : <Text style={S.muted}>{wErr || 'Tap ↻ to pull wind and temp for your position.'}</Text>}
          {weather && wErr ? <Text style={S.warn}>{wErr}</Text> : null}
        </View>

        <View style={[S.card, S.rec]}>
          {rec ? <>
            <Text style={S.muted}>Plays as {rec.target} yds</Text>
            <Text style={S.club}>{rec.pick.k}{rec.alt ? <Text style={S.alt}>  / {rec.alt.k}</Text> : null}</Text>
            <Text style={S.h3}>{rec.pick.name}</Text>
            <Text style={{ textAlign:'center' }}>{rec.note}</Text>
            {rec.pick.bias ? <Text style={S.tiny}>Typical miss {rec.pick.bias} — favor the other side.</Text> : null}
            {rec.adj.map(([n,a]) => <View key={n} style={S.row}><Text style={S.tiny}>{n}</Text><Text style={S.tiny}>{a > 0 ? '+' : ''}{Math.round(a)} yds</Text></View>)}
          </> : <Text>Add clubs in Bag.</Text>}
        </View>

        <View style={S.card}>
          <Text style={S.h3}>Conditions</Text>
          <Seg options={['tee','fairway','rough','sand']} value={cond.lie} onChange={v => setCond({ ...cond, lie:v })} />
          <View style={{ opacity: autoWind && weather ? 0.4 : 1 }} pointerEvents={autoWind && weather ? 'none' : 'auto'}>
            <Seg options={['calm','into','down','cross']} value={cond.dir} onChange={v => setCond({ ...cond, dir:v })} />
            <Stepper label="Wind mph" value={cond.wind} onChange={v => setCond({ ...cond, wind: Math.max(0, v) })} />
            <Stepper label="Temp °F" value={cond.temp} step={5} onChange={v => setCond({ ...cond, temp:v })} />
          </View>
          <Stepper label="Elevation ft (+ up)" value={cond.elev} step={5} onChange={v => setCond({ ...cond, elev:v })} />
        </View>
      </ScrollView>}

      {tab === 'pins' && <View style={{ flex:1 }}>
        <MapView style={{ flex:1 }} mapType="satellite" showsUserLocation initialRegion={pin ? { ...pin, latitudeDelta:0.01, longitudeDelta:0.01 } : COURSE.start}
          onPress={e => { setPins({ ...pins, [hole]: e.nativeEvent.coordinate }); if (hole < 18) setHole(hole+1); }}>
          {Object.entries(pins).map(([h, c]) => <Marker key={h} coordinate={c} title={`Hole ${h}`} pinColor={+h === hole ? 'green' : 'red'} />)}
        </MapView>
        <View style={S.body}>
          <View style={S.row}><Btn label="‹" onPress={() => setHole(Math.max(1, hole-1))} /><Text style={S.h2}>Hole {hole} · Par {COURSE.pars[hole-1]}</Text><Btn label="›" onPress={() => setHole(Math.min(18, hole+1))} /></View>
          <Text style={S.muted}>{pins[hole] ? 'Pinned. Tap again to move.' : `Tap the center of green ${hole}.`}  {Object.keys(pins).length}/18 pinned</Text>
          <View style={S.row}><Btn label="Clear hole" onPress={() => { const p = { ...pins }; delete p[hole]; setPins(p); }} /><Btn label="Done" primary onPress={() => setTab('caddy')} /></View>
        </View>
      </View>}

      {tab === 'score' && <ScrollView contentContainerStyle={S.body}>
        <View style={S.row}><Text style={S.h2}>{COURSE.name}</Text><Text style={S.h2}>{toPar > 0 ? '+' : ''}{toPar === 0 ? 'E' : toPar} thru {played}</Text></View>
        <Seg options={Object.keys(COURSE.tees)} value={tee} onChange={setTee} small />
        {COURSE.pars.map((p, i) => { const h = i+1, s = scores[h]; return (
          <Pressable key={h} onPress={() => setHole(h)} style={[S.row, S.holeRow, h === hole && S.holeCur]}>
            <Text style={S.h3}>{h}</Text><Text style={S.muted}>Par {p} · {COURSE.tees[tee][i]}</Text>
            <View style={S.row}><Btn label="−" onPress={() => s > 1 && setScores({ ...scores, [h]: s-1 })} />
              <Text style={[S.h2, { width: 36, textAlign:'center' }]}>{s ?? '–'}</Text>
              <Btn label="+" onPress={() => setScores({ ...scores, [h]: (s ?? p) + 1 })} /></View>
          </Pressable>); })}
        <Btn label="Clear round" onPress={() => setScores({})} />
      </ScrollView>}

      {tab === 'bag' && <ScrollView contentContainerStyle={S.body}>
        <Text style={S.h3}>Clubs · stock carry (yds)</Text>
        {bag.map((c, i) => <View key={c.k} style={S.row}>
          <Text style={[S.h3, { width: 40 }]}>{c.k}</Text><Text style={{ flex:1 }}>{c.name}{c.bias ? <Text style={S.tiny}>  miss {c.bias}</Text> : null}</Text>
          <TextInput style={[S.input, { width: 70 }]} keyboardType="number-pad" value={String(c.carry)} onChangeText={v => { const b = [...bag]; b[i] = { ...c, carry: parseInt(v) || 0 }; setBag(b); }} />
        </View>)}
        <Btn label="Reset bag" onPress={() => setBag(DEFAULT_BAG)} />
        <Text style={[S.h3, { marginTop: 16 }]}>Windy weather</Text>
        <TextInput style={S.input} placeholder="Point Forecast API key" value={windyKey} onChangeText={setWindyKey} autoCapitalize="none" autoCorrect={false} />
        <Seg options={['namConus','gfs','iconEu']} value={model} onChange={setModel} small />
        <Text style={S.tiny}>Point Forecast keys only (api.windy.com/point-forecast). The free trial key returns shuffled data; a paid key gives real forecasts.</Text>
      </ScrollView>}

      <View style={S.tabs}>{[['caddy','Caddy'],['score','Score'],['bag','Bag'],['pins','Pins']].map(([k,l]) =>
        <Pressable key={k} onPress={() => setTab(k)} style={S.tab}><Text style={[S.tabT, tab === k && S.tabOn]}>{l}</Text></Pressable>)}</View>
    </SafeAreaView>
  );
}

function windText(r) {
  if (r.dir === 'calm') return 'Calm — no wind adjustment.';
  if (r.dir === 'into') return `Into: ${r.head} mph headwind, ${r.cross} cross.`;
  if (r.dir === 'down') return `Down: ${r.head} mph helping, ${r.cross} cross.`;
  return `Crosswind: ${r.cross} mph across, ${r.head} along. Aim into it.`;
}
const Btn = ({ label, onPress, primary }) => <Pressable onPress={onPress} style={[S.btn, primary && S.btnP]}><Text style={[S.btnT, primary && { color:'#fff' }]}>{label}</Text></Pressable>;
const Toggle = ({ on, onPress, label }) => <Pressable onPress={onPress} style={S.row}><Text>{label}</Text><Text style={[S.pill, on && S.pillOn]}>{on ? 'ON' : 'OFF'}</Text></Pressable>;
const Seg = ({ options, value, onChange, small }) => <View style={[S.seg, small && { flexWrap:'wrap' }]}>{options.map(o =>
  <Pressable key={o} onPress={() => onChange(o)} style={[S.segB, value === o && S.segOn]}><Text style={[S.segT, value === o && { color:'#fff' }]}>{o}</Text></Pressable>)}</View>;
const Stepper = ({ label, value, onChange, step = 1 }) => <View style={S.row}><Text>{label}: {value}</Text><View style={S.row}><Btn label="−" onPress={() => onChange(value - step)} /><Btn label="+" onPress={() => onChange(value + step)} /></View></View>;

const S = StyleSheet.create({
  root:{ flex:1, backgroundColor:'#0f1512' }, body:{ padding:16, gap:12 },
  row:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:8 },
  big:{ fontSize:76, fontWeight:'800', color:'#fff', textAlign:'center', fontVariant:['tabular-nums'] },
  h2:{ fontSize:18, fontWeight:'700', color:'#fff' }, h3:{ fontSize:16, fontWeight:'700', color:'#fff' },
  muted:{ color:'#9fb3a8', textAlign:'center' }, tiny:{ color:'#9fb3a8', fontSize:12 }, warn:{ color:'#ffb86b', fontSize:12 },
  card:{ backgroundColor:'#19231e', borderRadius:14, padding:14, gap:8 }, rec:{ borderWidth:2, borderColor:'#2ecc71', alignItems:'center' },
  club:{ fontSize:64, fontWeight:'900', color:'#fff' }, alt:{ fontSize:32, color:'#9fb3a8' },
  input:{ backgroundColor:'#19231e', color:'#fff', borderRadius:10, padding:10, fontSize:16 },
  btn:{ backgroundColor:'#263229', paddingVertical:10, paddingHorizontal:14, borderRadius:10 }, btnP:{ backgroundColor:'#2ecc71' }, btnT:{ color:'#fff', fontWeight:'700' },
  pill:{ color:'#9fb3a8', borderWidth:1, borderColor:'#9fb3a8', borderRadius:12, paddingHorizontal:10, paddingVertical:2 }, pillOn:{ color:'#2ecc71', borderColor:'#2ecc71' },
  seg:{ flexDirection:'row', gap:6 }, segB:{ flex:1, minWidth:70, paddingVertical:8, borderRadius:8, backgroundColor:'#263229', alignItems:'center' }, segOn:{ backgroundColor:'#2ecc71' }, segT:{ color:'#cfe3d8', fontSize:13 },
  holeRow:{ paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#263229' }, holeCur:{ backgroundColor:'#19231e', borderRadius:8, paddingHorizontal:6 },
  tabs:{ flexDirection:'row', borderTopWidth:1, borderTopColor:'#263229', backgroundColor:'#0f1512' }, tab:{ flex:1, alignItems:'center', paddingVertical:12 }, tabT:{ color:'#9fb3a8', fontWeight:'600' }, tabOn:{ color:'#2ecc71' },
});
