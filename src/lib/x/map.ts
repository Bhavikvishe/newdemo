export const xEn: Record<string, string> = {
  'map.sub':
    'GPS-tagged detections across surveyed grids — cluster size reflects detection volume at each position.',
  'map.ktLocal': 'Local search',
  'map.clsLabel': 'Detection class',
  'map.riskLevel': 'Risk level',
  'map.timeWindow': 'Time window',
  'map.windowAll': 'All history',
  'map.windowHours': 'Last {n} hours',
  'map.windowDays': 'Last {n} days',
  'map.resultsTitle':
    '{clusters} clusters · {detections} detections',
  'map.empty':
    'No detections match the current filters.',
  'map.viewCase': 'View case',
  'map.locationCluster': 'Location cluster',
  'map.bundled':
    '{n} detection{s} bundled at this position',
  'map.conf': '{pct}% conf',
  'map.legend.marine': 'Marine',
  'map.legend.grid':
    'GRID 3° / ISOBATH 100·200m',
  'map.basemap': 'BASEMAP',
  'map.gisConnecting':
    'Satellite feed connecting…',

  /*
   * -------------------------------------------------------
   * OCEAN MAP / NAVIGATION
   * -------------------------------------------------------
   */

  'ngx.targetLockKt': 'NAVIGATION TARGET',
  'ngx.debrisCoords': 'Detection Coordinates',
  'ngx.pickFromDet': 'Select from detection',
  'ngx.manualEntry': 'Manual coordinate entry',

  'ngx.detOption':
    '{id} · {cls} · {coords}',

  'ngx.latField': 'Latitude',
  'ngx.latPh': '18.520400',

  'ngx.lngField': 'Longitude',
  'ngx.lngPh': '73.856700',

  'ngx.lockTarget': 'Lock Target',

  'ngx.rangeNote':
    'Supported range: {latMin}° to {latMax}° latitude · {lonMin}° to {lonMax}° longitude.',

  'ngx.lockedTarget': 'Locked target',

  /*
   * -------------------------------------------------------
   * VESSEL / GPS
   * -------------------------------------------------------
   */

  'ngx.myPosKt': 'VESSEL POSITION',
  'ngx.vesselOrigin': 'Vessel origin',

  'ngx.locLive': 'GPS LIVE',
  'ngx.locLocating': 'LOCATING',
  'ngx.locDenied': 'GPS UNAVAILABLE',
  'ngx.locSim': 'SIMULATION',

  'ngx.trackingAuto': 'LIVE GPS',
  'ngx.offlineMode': 'SIMULATION / OFFLINE',

  'ngx.enableGps': 'Use Device GPS',
  'ngx.disableGps': 'Disable Device GPS',

  'ngx.originNote':
    'Device GPS is unavailable. Navigation is using the configured simulation origin.',

  /*
   * -------------------------------------------------------
   * ROUTE / TRANSIT
   * -------------------------------------------------------
   */

  'ngx.transitKt': 'TRANSIT',
  'ngx.routeEta': 'Route / ETA',

  'ngx.vesselSpeed': 'Vessel speed',

  'ngx.speedTrawl': '{kn} kn · Trawl',
  'ngx.speedSurvey': '{kn} kn · Survey',
  'ngx.speedResponse': '{kn} kn · Response',
  'ngx.speedMax': '{kn} kn · Maximum',

  'ngx.distToSite': 'Distance to target',
  'ngx.bearing': 'Bearing',
  'ngx.eta': 'ETA',

  'ngx.gcRoute': 'Great-circle route',
  'ngx.waypoints': '{count} waypoints',

  'ngx.noTarget':
    'No navigation target is currently locked.',

  'ngx.legendRoute': 'Navigation route',

  /*
   * -------------------------------------------------------
   * COMMON
   * -------------------------------------------------------
   */

  'common.clear': 'Clear',
};

export const xHi: Record<string, string> = {
  'map.sub':
    'सर्वेक्षण किए गए ग्रिडों पर जीपीएस-टैग की गई डिटेक्शन — प्रत्येक स्थान पर क्लस्टर का आकार डिटेक्शन की मात्रा दर्शाता है।',
  'map.ktLocal': 'स्थानीय खोज',
  'map.clsLabel': 'डिटेक्शन क्लास',
  'map.riskLevel': 'जोखिम स्तर',
  'map.timeWindow': 'समय अवधि',
  'map.windowAll': 'पूरा इतिहास',
  'map.windowHours': 'पिछले {n} घंटे',
  'map.windowDays': 'पिछले {n} दिन',
  'map.resultsTitle':
    '{clusters} क्लस्टर · {detections} डिटेक्शन',
  'map.empty':
    'वर्तमान फ़िल्टर से कोई डिटेक्शन मेल नहीं खाती।',
  'map.viewCase': 'मामला देखें',
  'map.locationCluster': 'स्थान क्लस्टर',
  'map.bundled':
    '{n} डिटेक्शन इस स्थान पर एकत्र हैं',
  'map.conf': '{pct}% विश्वास',
  'map.legend.marine': 'समुद्री',
  'map.legend.grid':
    'ग्रिड 3° / समान गहराई रेखा 100·200मी',
  'map.basemap': 'बेसमैप',
  'map.gisConnecting':
    'सैटेलाइट फ़ीड कनेक्ट हो रहा है…',

  /*
   * OCEAN MAP / NAVIGATION
   */

  'ngx.targetLockKt': 'नेविगेशन लक्ष्य',
  'ngx.debrisCoords': 'डिटेक्शन निर्देशांक',
  'ngx.pickFromDet': 'डिटेक्शन से चुनें',
  'ngx.manualEntry': 'निर्देशांक मैन्युअल रूप से दर्ज करें',

  'ngx.detOption':
    '{id} · {cls} · {coords}',

  'ngx.latField': 'अक्षांश',
  'ngx.latPh': '18.520400',

  'ngx.lngField': 'देशांतर',
  'ngx.lngPh': '73.856700',

  'ngx.lockTarget': 'लक्ष्य लॉक करें',

  'ngx.rangeNote':
    'समर्थित सीमा: अक्षांश {latMin}° से {latMax}° · देशांतर {lonMin}° से {lonMax}°।',

  'ngx.lockedTarget': 'लॉक किया गया लक्ष्य',

  /*
   * VESSEL / GPS
   */

  'ngx.myPosKt': 'जहाज़ की स्थिति',
  'ngx.vesselOrigin': 'जहाज़ का प्रारंभिक स्थान',

  'ngx.locLive': 'जीपीएस लाइव',
  'ngx.locLocating': 'स्थान खोजा जा रहा है',
  'ngx.locDenied': 'जीपीएस उपलब्ध नहीं',
  'ngx.locSim': 'सिमुलेशन',

  'ngx.trackingAuto': 'लाइव जीपीएस',
  'ngx.offlineMode': 'सिमुलेशन / ऑफलाइन',

  'ngx.enableGps': 'डिवाइस जीपीएस उपयोग करें',
  'ngx.disableGps': 'डिवाइस जीपीएस बंद करें',

  'ngx.originNote':
    'डिवाइस जीपीएस उपलब्ध नहीं है। नेविगेशन कॉन्फ़िगर किए गए सिमुलेशन स्थान का उपयोग कर रहा है।',

  /*
   * ROUTE / TRANSIT
   */

  'ngx.transitKt': 'ट्रांजिट',
  'ngx.routeEta': 'मार्ग / अनुमानित समय',

  'ngx.vesselSpeed': 'जहाज़ की गति',

  'ngx.speedTrawl': '{kn} नॉट · ट्रॉल',
  'ngx.speedSurvey': '{kn} नॉट · सर्वेक्षण',
  'ngx.speedResponse': '{kn} नॉट · प्रतिक्रिया',
  'ngx.speedMax': '{kn} नॉट · अधिकतम',

  'ngx.distToSite': 'लक्ष्य की दूरी',
  'ngx.bearing': 'दिशा',
  'ngx.eta': 'अनुमानित समय',

  'ngx.gcRoute': 'ग्रेट-सर्कल मार्ग',
  'ngx.waypoints': '{count} वेपॉइंट',

  'ngx.noTarget':
    'अभी कोई नेविगेशन लक्ष्य लॉक नहीं है।',

  'ngx.legendRoute': 'नेविगेशन मार्ग',

  'common.clear': 'साफ़ करें',
};

export const xMr: Record<string, string> = {
  'map.sub':
    'सर्वेक्षण केलेल्या ग्रिडवर जीपीएस-टॅग केलेले डिटेक्शन — प्रत्येक ठिकाणी क्लस्टरचा आकार डिटेक्शनची संख्या दर्शवतो.',
  'map.ktLocal': 'स्थानिक शोध',
  'map.clsLabel': 'डिटेक्शन वर्ग',
  'map.riskLevel': 'जोखीम पातळी',
  'map.timeWindow': 'कालावधी',
  'map.windowAll': 'संपूर्ण इतिहास',
  'map.windowHours': 'गेले {n} तास',
  'map.windowDays': 'गेले {n} दिवस',
  'map.resultsTitle':
    '{clusters} क्लस्टर्स · {detections} डिटेक्शन',
  'map.empty':
    'सध्याच्या फिल्टरशी कोणतेही डिटेक्शन जुळत नाही.',
  'map.viewCase': 'केस पहा',
  'map.locationCluster': 'स्थान क्लस्टर',
  'map.bundled':
    '{n} डिटेक्शन या ठिकाणी एकत्र आहेत',
  'map.conf': '{pct}% आत्मविश्वास',
  'map.legend.marine': 'सागरी',
  'map.legend.grid':
    'ग्रिड 3° / समान खोली रेषा 100·200मी',
  'map.basemap': 'बेसमॅप',
  'map.gisConnecting':
    'सॅटेलाइट फीड कनेक्ट होत आहे…',

  /*
   * OCEAN MAP / NAVIGATION
   */

  'ngx.targetLockKt': 'नेव्हिगेशन लक्ष्य',
  'ngx.debrisCoords': 'डिटेक्शन निर्देशांक',
  'ngx.pickFromDet': 'डिटेक्शनमधून निवडा',
  'ngx.manualEntry': 'निर्देशांक मॅन्युअली प्रविष्ट करा',

  'ngx.detOption':
    '{id} · {cls} · {coords}',

  'ngx.latField': 'अक्षांश',
  'ngx.latPh': '18.520400',

  'ngx.lngField': 'रेखांश',
  'ngx.lngPh': '73.856700',

  'ngx.lockTarget': 'लक्ष्य लॉक करा',

  'ngx.rangeNote':
    'समर्थित मर्यादा: अक्षांश {latMin}° ते {latMax}° · रेखांश {lonMin}° ते {lonMax}°.',

  'ngx.lockedTarget': 'लॉक केलेले लक्ष्य',

  /*
   * VESSEL / GPS
   */

  'ngx.myPosKt': 'जहाजाची स्थिती',
  'ngx.vesselOrigin': 'जहाजाचे प्रारंभिक स्थान',

  'ngx.locLive': 'जीपीएस लाइव्ह',
  'ngx.locLocating': 'स्थान शोधत आहे',
  'ngx.locDenied': 'जीपीएस उपलब्ध नाही',
  'ngx.locSim': 'सिम्युलेशन',

  'ngx.trackingAuto': 'लाइव्ह जीपीएस',
  'ngx.offlineMode': 'सिम्युलेशन / ऑफलाइन',

  'ngx.enableGps': 'डिव्हाइस जीपीएस वापरा',
  'ngx.disableGps': 'डिव्हाइस जीपीएस बंद करा',

  'ngx.originNote':
    'डिव्हाइस जीपीएस उपलब्ध नाही. नेव्हिगेशन कॉन्फिगर केलेल्या सिम्युलेशन स्थानाचा वापर करत आहे.',

  /*
   * ROUTE / TRANSIT
   */

  'ngx.transitKt': 'ट्रांझिट',
  'ngx.routeEta': 'मार्ग / अपेक्षित वेळ',

  'ngx.vesselSpeed': 'जहाजाचा वेग',

  'ngx.speedTrawl': '{kn} नॉट · ट्रॉल',
  'ngx.speedSurvey': '{kn} नॉट · सर्वेक्षण',
  'ngx.speedResponse': '{kn} नॉट · प्रतिसाद',
  'ngx.speedMax': '{kn} नॉट · कमाल',

  'ngx.distToSite': 'लक्ष्यापर्यंतचे अंतर',
  'ngx.bearing': 'दिशा',
  'ngx.eta': 'अपेक्षित वेळ',

  'ngx.gcRoute': 'ग्रेट-सर्कल मार्ग',
  'ngx.waypoints': '{count} वेपॉइंट',

  'ngx.noTarget':
    'सध्या कोणतेही नेव्हिगेशन लक्ष्य लॉक केलेले नाही.',

  'ngx.legendRoute': 'नेव्हिगेशन मार्ग',

  'common.clear': 'साफ करा',
};