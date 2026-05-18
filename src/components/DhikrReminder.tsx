import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MOTIVATIONAL_QUOTES } from "@/data/motivational-quotes";

const ADHKAR = [
  { text: "سُبْحَانَ اللهِ وَبِحَمْدِهِ، سُبْحَانَ اللهِ الْعَظِيمِ", source: "متفق عليه" },
  { text: "لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", source: "البخاري" },
  { text: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ", source: "البخاري ومسلم" },
  { text: "أَسْتَغْفِرُ اللهَ الْعَظِيمَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ", source: "الترمذي" },
  { text: "حَسْبِيَ اللهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ", source: "أبو داود" },
  { text: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللهِ الْعَلِيِّ الْعَظِيمِ", source: "البخاري ومسلم" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ", source: "ابن ماجه" },
  { text: "سُبْحَانَ اللهِ وَالْحَمْدُ لِلهِ وَلَا إِلَهَ إِلَّا اللهُ وَاللهُ أَكْبَرُ", source: "مسلم" },
  { text: "رَضِيتُ بِاللهِ رَبًّا وَبِالْإِسْلَامِ دِينًا وَبِمُحَمَّدٍ ﷺ نَبِيًّا وَرَسُولًا", source: "أبو داود" },
  { text: "اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ", source: "أبو داود" },
  { text: "اللَّهُمَّ اجْعَلِ الْقُرْآنَ رَبِيعَ قَلْبِي وَنُورَ صَدْرِي وَجَلَاءَ حُزْنِي وَذَهَابَ هَمِّي", source: "أحمد" },
  { text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَأَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ، وَأَعُوذُ بِكَ مِنَ الْجُبْنِ وَالْبُخْلِ", source: "البخاري" },
  { text: "يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ", source: "الحاكم" },
  { text: "اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ النُّشُورُ", source: "الترمذي" },
  { text: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ", source: "الترمذي" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلًا مُتَقَبَّلًا", source: "ابن ماجه" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَأَعُوذُ بِكَ مِنَ النَّارِ", source: "أبو داود والنسائي" },
  { text: "أَعُوذُ بِكَلِمَاتِ اللهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ", source: "مسلم" },
  { text: "بِسْمِ اللهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ", source: "أبو داود" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى", source: "مسلم" },
  { text: "اللَّهُمَّ آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", source: "البخاري ومسلم" },
  { text: "لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ", source: "الترمذي" },
  { text: "اللَّهُمَّ اغْفِرْ لِي وَارْحَمْنِي وَاهْدِنِي وَعَافِنِي وَارْزُقْنِي", source: "مسلم" },
  { text: "سُبْحَانَ اللهِ وَبِحَمْدِهِ عَدَدَ خَلْقِهِ وَرِضَا نَفْسِهِ وَزِنَةَ عَرْشِهِ وَمِدَادَ كَلِمَاتِهِ", source: "مسلم" },
  { text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْكُفْرِ وَالْفَقْرِ وَعَذَابِ الْقَبْرِ", source: "النسائي" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنَ الْخَيْرِ كُلِّهِ عَاجِلِهِ وَآجِلِهِ مَا عَلِمْتُ مِنْهُ وَمَا لَمْ أَعْلَمْ", source: "ابن ماجه" },
  { text: "الْحَمْدُ لِلهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ", source: "البخاري" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ حُبَّكَ وَحُبَّ مَنْ يُحِبُّكَ وَحُبَّ عَمَلٍ يُقَرِّبُنِي إِلَى حُبِّكَ", source: "الترمذي" },
  { text: "رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي يَفْقَهُوا قَوْلِي", source: "القرآن الكريم" },
  { text: "رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنْتَ السَّمِيعُ الْعَلِيمُ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ إِنِّي ظَلَمْتُ نَفْسِي ظُلْمًا كَثِيرًا وَلَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ فَاغْفِرْ لِي مَغْفِرَةً مِنْ عِنْدِكَ وَارْحَمْنِي", source: "البخاري ومسلم" },
  { text: "رَبِّ زِدْنِي عِلْمًا", source: "القرآن الكريم" },
  { text: "رَبَّنَا آتِنَا مِنْ لَدُنْكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ", source: "الترمذي" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الثَّبَاتَ فِي الْأَمْرِ وَالْعَزِيمَةَ عَلَى الرُّشْدِ وَأَسْأَلُكَ شُكْرَ نِعْمَتِكَ وَحُسْنَ عِبَادَتِكَ", source: "النسائي" },
  { text: "حَسْبُنَا اللهُ وَنِعْمَ الْوَكِيلُ", source: "البخاري" },
  { text: "لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ أَنْجَزَ وَعْدَهُ وَنَصَرَ عَبْدَهُ وَهَزَمَ الْأَحْزَابَ وَحْدَهُ", source: "البخاري ومسلم" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ يَا اللهُ بِأَنَّكَ الْوَاحِدُ الْأَحَدُ الصَّمَدُ الَّذِي لَمْ يَلِدْ وَلَمْ يُولَدْ وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ أَنْ تَغْفِرَ لِي ذُنُوبِي", source: "أبو داود" },
  { text: "رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ", source: "الترمذي" },
  { text: "اللَّهُمَّ احْفَظْنِي مِنْ بَيْنِ يَدَيَّ وَمِنْ خَلْفِي وَعَنْ يَمِينِي وَعَنْ شِمَالِي وَمِنْ فَوْقِي وَأَعُوذُ بِعَظَمَتِكَ أَنْ أُغْتَالَ مِنْ تَحْتِي", source: "أبو داود" },
  { text: "اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَهَ إِلَّا أَنْتَ", source: "أبو داود" },
  { text: "الْحَمْدُ لِلهِ رَبِّ الْعَالَمِينَ", source: "القرآن الكريم" },
  { text: "اللهُ أَكْبَرُ كَبِيرًا وَالْحَمْدُ لِلهِ كَثِيرًا وَسُبْحَانَ اللهِ بُكْرَةً وَأَصِيلًا", source: "مسلم" },
  { text: "رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِنْ لَدُنْكَ رَحْمَةً إِنَّكَ أَنْتَ الْوَهَّابُ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ مُصَرِّفَ الْقُلُوبِ، صَرِّفْ قُلُوبَنَا عَلَى طَاعَتِكَ", source: "مسلم" },
  { text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عِلْمٍ لَا يَنْفَعُ وَمِنْ قَلْبٍ لَا يَخْشَعُ وَمِنْ نَفْسٍ لَا تَشْبَعُ وَمِنْ دَعْوَةٍ لَا يُسْتَجَابُ لَهَا", source: "مسلم" },
  { text: "سُبْحَانَ اللهِ وَبِحَمْدِهِ", source: "البخاري ومسلم" },
  { text: "اللهُ أَكْبَرُ", source: "البخاري ومسلم" },
  { text: "الْحَمْدُ لِلهِ", source: "مسلم" },
  { text: "لَا إِلَهَ إِلَّا اللهُ", source: "البخاري ومسلم" },
  { text: "أَسْتَغْفِرُ اللهَ وَأَتُوبُ إِلَيْهِ", source: "البخاري" },
  { text: "رَبِّ أَعِنِّي وَلَا تُعِنْ عَلَيَّ، وَانْصُرْنِي وَلَا تَنْصُرْ عَلَيَّ، وَامْكُرْ لِي وَلَا تَمْكُرْ عَلَيَّ", source: "أبو داود" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ حُسْنَ الْخَاتِمَةِ", source: "الطبراني" },
  { text: "رَبِّ إِنِّي لِمَا أَنْزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ", source: "البخاري" },
  { text: "اللَّهُمَّ اغْفِرْ لِي ذَنْبِي كُلَّهُ دِقَّهُ وَجِلَّهُ وَأَوَّلَهُ وَآخِرَهُ وَعَلَانِيَتَهُ وَسِرَّهُ", source: "مسلم" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْفِرْدَوْسَ الْأَعْلَى مِنَ الْجَنَّةِ", source: "البخاري" },
  { text: "اللَّهُمَّ أَلِّفْ بَيْنَ قُلُوبِنَا وَأَصْلِحْ ذَاتَ بَيْنِنَا وَاهْدِنَا سُبُلَ السَّلَامِ", source: "أبو داود" },
  { text: "رَبَّنَا اغْفِرْ لَنَا ذُنُوبَنَا وَإِسْرَافَنَا فِي أَمْرِنَا وَثَبِّتْ أَقْدَامَنَا وَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ رِضَاكَ وَالْجَنَّةَ وَأَعُوذُ بِكَ مِنْ سَخَطِكَ وَالنَّارِ", source: "النسائي" },
  { text: "اللَّهُمَّ أَصْلِحْ لِي دِينِي الَّذِي هُوَ عِصْمَةُ أَمْرِي وَأَصْلِحْ لِي دُنْيَايَ الَّتِي فِيهَا مَعَاشِي وَأَصْلِحْ لِي آخِرَتِي الَّتِي فِيهَا مَعَادِي", source: "مسلم" },
  { text: "اللَّهُمَّ آتِ نَفْسِي تَقْوَاهَا وَزَكِّهَا أَنْتَ خَيْرُ مَنْ زَكَّاهَا أَنْتَ وَلِيُّهَا وَمَوْلَاهَا", source: "مسلم" },
  { text: "اللَّهُمَّ إِنِّي أَعُوذُ بِرِضَاكَ مِنْ سَخَطِكَ وَبِمُعَافَاتِكَ مِنْ عُقُوبَتِكَ وَأَعُوذُ بِكَ مِنْكَ لَا أُحْصِي ثَنَاءً عَلَيْكَ أَنْتَ كَمَا أَثْنَيْتَ عَلَى نَفْسِكَ", source: "مسلم" },
  { text: "رَبَّنَا لَا تَجْعَلْنَا فِتْنَةً لِلْقَوْمِ الظَّالِمِينَ وَنَجِّنَا بِرَحْمَتِكَ مِنَ الْقَوْمِ الْكَافِرِينَ", source: "القرآن الكريم" },
  { text: "رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ الَّتِي أَنْعَمْتَ عَلَيَّ وَعَلَى وَالِدَيَّ وَأَنْ أَعْمَلَ صَالِحًا تَرْضَاهُ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ أَحْسِنْ عَاقِبَتَنَا فِي الْأُمُورِ كُلِّهَا وَأَجِرْنَا مِنْ خِزْيِ الدُّنْيَا وَعَذَابِ الْآخِرَةِ", source: "أحمد" },
  { text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْغَمِّ وَالْحَزَنِ وَأَعُوذُ بِكَ مِنَ الضَّعْفِ وَالْكَسَلِ", source: "البخاري" },
  { text: "اللَّهُمَّ فَاطِرَ السَّمَاوَاتِ وَالْأَرْضِ، عَالِمَ الْغَيْبِ وَالشَّهَادَةِ، أَنْتَ تَحْكُمُ بَيْنَ عِبَادِكَ فِيمَا كَانُوا فِيهِ يَخْتَلِفُونَ", source: "مسلم" },
  { text: "اللَّهُمَّ اجْعَلْنِي مِنَ الَّذِينَ إِذَا أَحْسَنُوا اسْتَبْشَرُوا وَإِذَا أَسَاؤُوا اسْتَغْفَرُوا", source: "ابن ماجه" },
  { text: "لَا إِلَهَ إِلَّا اللهُ الْعَظِيمُ الْحَلِيمُ، لَا إِلَهَ إِلَّا اللهُ رَبُّ الْعَرْشِ الْعَظِيمِ، لَا إِلَهَ إِلَّا اللهُ رَبُّ السَّمَاوَاتِ وَرَبُّ الْأَرْضِ وَرَبُّ الْعَرْشِ الْكَرِيمِ", source: "البخاري ومسلم" },
  { text: "اللَّهُمَّ اهْدِنِي وَسَدِّدْنِي", source: "مسلم" },
  { text: "اللَّهُمَّ أَلْهِمْنِي رُشْدِي وَأَعِذْنِي مِنْ شَرِّ نَفْسِي", source: "الترمذي" },
  { text: "رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ خَيْرِ مَا سَأَلَكَ مِنْهُ نَبِيُّكَ مُحَمَّدٌ ﷺ وَأَعُوذُ بِكَ مِنْ شَرِّ مَا اسْتَعَاذَ مِنْهُ نَبِيُّكَ مُحَمَّدٌ ﷺ", source: "الترمذي" },
  { text: "رَبَّنَا اصْرِفْ عَنَّا عَذَابَ جَهَنَّمَ إِنَّ عَذَابَهَا كَانَ غَرَامًا", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الصِّحَّةَ وَالْعِفَّةَ وَالْأَمَانَةَ وَحُسْنَ الْخُلُقِ وَالرِّضَا بِالْقَدَرِ", source: "أحمد" },
  { text: "سُبْحَانَ اللهِ الْعَظِيمِ وَبِحَمْدِهِ", source: "الترمذي" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ يَا أَللهُ الْأَحَدُ الصَّمَدُ الَّذِي لَمْ يَلِدْ وَلَمْ يُولَدْ أَنْ تَغْفِرَ لِي ذُنُوبِي وَتَرْحَمَنِي", source: "ابن ماجه" },
  { text: "اللَّهُمَّ أَعِنِّي عَلَى طَاعَتِكَ وَاجْعَلْ عَمَلِي خَالِصًا لِوَجْهِكَ الْكَرِيمِ", source: "النسائي" },
  { text: "رَبَّنَا أَفْرِغْ عَلَيْنَا صَبْرًا وَثَبِّتْ أَقْدَامَنَا وَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ", source: "أبو داود" },
  { text: "اللَّهُمَّ حَبِّبْ إِلَيْنَا الْإِيمَانَ وَزَيِّنْهُ فِي قُلُوبِنَا وَكَرِّهْ إِلَيْنَا الْكُفْرَ وَالْفُسُوقَ وَالْعِصْيَانَ", source: "أحمد" },
  { text: "اللَّهُمَّ اجْعَلْ أَوَّلَ هَذَا الْأَمْرِ صَلَاحًا وَأَوْسَطَهُ فَلَاحًا وَآخِرَهُ نَجَاحًا", source: "الطبراني" },
  { text: "رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِنْ ذُرِّيَّتِي رَبَّنَا وَتَقَبَّلْ دُعَاءِ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ ثَبِّتْ قَلْبِي عَلَى دِينِكَ", source: "الترمذي" },
  { text: "اللَّهُمَّ اجْعَلْنَا هُدَاةً مُهْتَدِينَ غَيْرَ ضَالِّينَ وَلَا مُضِلِّينَ", source: "الترمذي" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَ الْمَسْأَلَةِ وَخَيْرَ الدُّعَاءِ وَخَيْرَ النَّجَاحِ وَخَيْرَ الْعَمَلِ وَخَيْرَ الثَّوَابِ وَخَيْرَ الْحَيَاةِ وَخَيْرَ الْمَمَاتِ", source: "الطبراني" },
  { text: "اللَّهُمَّ طَهِّرْ قَلْبِي مِنَ النِّفَاقِ وَعَمَلِي مِنَ الرِّيَاءِ وَلِسَانِي مِنَ الْكَذِبِ وَعَيْنِي مِنَ الْخِيَانَةِ", source: "الطبراني" },
  { text: "اللَّهُمَّ إِنَّكَ عَفُوٌّ كَرِيمٌ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي", source: "الترمذي وابن ماجه" },
  { text: "رَبِّ إِنِّي أَعُوذُ بِكَ أَنْ أَسْأَلَكَ مَا لَيْسَ لِي بِهِ عِلْمٌ وَإِلَّا تَغْفِرْ لِي وَتَرْحَمْنِي أَكُنْ مِنَ الْخَاسِرِينَ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ", source: "مسلم" },
  { text: "اللَّهُمَّ اغْفِرْ لِي خَطِيئَتِي وَجَهْلِي وَإِسْرَافِي فِي أَمْرِي وَمَا أَنْتَ أَعْلَمُ بِهِ مِنِّي", source: "البخاري ومسلم" },
  { text: "اللَّهُمَّ لَكَ أَسْلَمْتُ وَبِكَ آمَنْتُ وَعَلَيْكَ تَوَكَّلْتُ وَإِلَيْكَ أَنَبْتُ وَبِكَ خَاصَمْتُ", source: "البخاري ومسلم" },
  { text: "رَبِّ أَعُوذُ بِكَ مِنْ هَمَزَاتِ الشَّيَاطِينِ وَأَعُوذُ بِكَ رَبِّ أَنْ يَحْضُرُونِ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ مَا أَصْبَحَ بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ", source: "أبو داود" },
];

const INTERVAL_MS = 10 * 60 * 1000;
const COUNTER_KEY = "dhikr_counter_v1";
const ORDER_KEY = "dhikr_order_session_v1";
const QUOTE_ORDER_KEY = "motivational_order_session_v1";
const TARGET = 1000;
const QUOTE_DELAY_MS = 40000;
const QUOTE_AUTO_HIDE_MS = 25000;

function getShuffledQuoteOrder(): number[] {
  try {
    const raw = sessionStorage.getItem(QUOTE_ORDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const arr = MOTIVATIONAL_QUOTES.map((_, i) => i).sort(() => Math.random() - 0.5);
  try { sessionStorage.setItem(QUOTE_ORDER_KEY, JSON.stringify(arr)); } catch {}
  return arr;
}

function toArabicNums(n: number): string {
  return n.toString().replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

function getShuffledOrder(): number[] {
  try {
    const raw = sessionStorage.getItem(ORDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const arr = ADHKAR.map((_, i) => i).sort(() => Math.random() - 0.5);
  try { sessionStorage.setItem(ORDER_KEY, JSON.stringify(arr)); } catch {}
  return arr;
}

export function DhikrReminder() {
  const [visible, setVisible] = useState(false);
  const [dhikr, setDhikr] = useState(ADHKAR[0]);
  const [progress, setProgress] = useState(100);
  const [count, setCount] = useState(() => {
    try { return Math.min(TARGET, parseInt(localStorage.getItem(COUNTER_KEY) || "0", 10) || 0); } catch { return 0; }
  });
  const shownCountRef = useRef(0);
  const quoteShownRef = useRef(0);

  const [quoteVisible, setQuoteVisible] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [quoteProgress, setQuoteProgress] = useState(100);

  const showQuote = () => {
    const order = getShuffledQuoteOrder();
    const idx = order[quoteShownRef.current % order.length];
    quoteShownRef.current += 1;
    setQuoteText(MOTIVATIONAL_QUOTES[idx]);
    setQuoteVisible(true);
    setQuoteProgress(100);
  };

  const show = () => {
    const order = getShuffledOrder();
    const idx = order[shownCountRef.current % order.length];
    shownCountRef.current += 1;
    setDhikr(ADHKAR[idx]);
    setVisible(true);
    setProgress(100);
  };

  useEffect(() => {
    const firstTimer = setTimeout(show, 5000);
    const interval = setInterval(show, INTERVAL_MS);
    return () => { clearTimeout(firstTimer); clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const autoDismiss = setTimeout(() => setVisible(false), 35000);
    const tick = setInterval(() => setProgress((p) => Math.max(0, p - (100 / 140))), 250);
    const quoteTimer = setTimeout(showQuote, QUOTE_DELAY_MS);
    return () => { clearTimeout(autoDismiss); clearInterval(tick); clearTimeout(quoteTimer); };
  }, [visible]);

  useEffect(() => {
    if (!quoteVisible) return;
    const autoDismiss = setTimeout(() => setQuoteVisible(false), QUOTE_AUTO_HIDE_MS);
    const tick = setInterval(() => setQuoteProgress((p) => Math.max(0, p - (100 / (QUOTE_AUTO_HIDE_MS / 250)))), 250);
    return () => { clearTimeout(autoDismiss); clearInterval(tick); };
  }, [quoteVisible]);

  const increment = () => {
    setCount((c) => {
      const next = c >= TARGET - 1 ? 0 : c + 1;
      try { localStorage.setItem(COUNTER_KEY, String(next)); } catch {}
      if (next === 0) toast.success("أتممت ١٠٠٠ ذكر 🌿 بارك الله فيك وتقبّل منك");
      return next;
    });
  };

  if (!visible && !quoteVisible) return null;

  const pct = Math.round((count / TARGET) * 100);

  return (
    <>
    {/* بطاقة العبارة التحفيزية */}
    {quoteVisible && (
      <div dir="rtl" className="fixed bottom-24 left-4 z-[199] w-[300px] animate-in slide-in-from-bottom-4 fade-in duration-500">
        <div
          style={{ background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 60%, #fde68a 100%)", boxShadow: "0 8px 32px 0 rgba(245,158,11,0.18), 0 2px 8px 0 rgba(0,0,0,0.07)", border: "1.5px solid #fcd34d" }}
          className="rounded-3xl overflow-hidden"
        >
          {/* شريط التقدم */}
          <div className="h-1.5 bg-amber-100 w-full">
            <div className="h-full bg-gradient-to-l from-amber-400 to-yellow-400 transition-all duration-300" style={{ width: `${quoteProgress}%` }} />
          </div>
          {/* رأس */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-lg">✨</span>
              <span className="text-xs font-black text-amber-700 tracking-wide">عبارة تحفيزية</span>
            </div>
            <button onClick={() => setQuoteVisible(false)} className="text-amber-400 hover:text-amber-600 p-1 rounded-xl hover:bg-amber-100 transition">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          {/* النص */}
          <div className="px-4 pb-4 pt-1">
            <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.55)", border: "1px solid #fde68a" }}>
              <p className="text-center leading-loose text-amber-900 font-bold" style={{ fontFamily: "'Tajawal', sans-serif", fontSize: "0.97rem", lineHeight: "1.9" }}>
                {quoteText}
              </p>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* بطاقة الأذكار */}
    {visible && (
    <div
      dir="rtl"
      className="fixed bottom-24 left-4 z-[200] w-[320px] animate-in slide-in-from-bottom-4 fade-in duration-500"
    >
      {/* البطاقة الرئيسية — خلفية بيضاء دائماً */}
      <div
        style={{ background: "#ffffff", boxShadow: "0 8px 40px 0 rgba(16,86,51,0.13), 0 2px 8px 0 rgba(0,0,0,0.08)" }}
        className="rounded-3xl overflow-hidden"
      >
        {/* شريط التقدم العلوي */}
        <div className="h-1.5 bg-emerald-50 w-full">
          <div
            className="h-full bg-gradient-to-l from-emerald-400 to-teal-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* رأس البطاقة */}
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌿</span>
            <span className="text-sm font-black text-emerald-700 tracking-wide">تذكير بالذكر</span>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-xl hover:bg-gray-100 transition"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* نص الذكر */}
        <div className="px-5 pb-3 pt-2">
          <div
            className="rounded-2xl px-4 py-4"
            style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)", border: "1px solid #bbf7d0" }}
          >
            <p
              className="text-center leading-loose text-gray-800 font-bold"
              style={{ fontFamily: "'Tajawal', sans-serif", fontSize: "1.05rem", lineHeight: "2" }}
            >
              {dhikr.text}
            </p>
          </div>
          <p className="text-center text-[11px] text-emerald-600/70 mt-2 font-medium">— {dhikr.source}</p>
        </div>

        {/* فاصل */}
        <div className="mx-5 h-px bg-emerald-50" />

        {/* عداد الذكر */}
        <div className="px-5 py-4">
          <div className="text-xs text-gray-500 font-bold text-center mb-2">عدّاد الذكر</div>
          <button
            onClick={increment}
            className="w-full rounded-2xl py-3 transition-all active:scale-[0.97] select-none cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #f0fdf4 0%, #d1fae5 100%)",
              border: "2px solid #6ee7b7",
            }}
            title="اضغط لحساب الذكر"
          >
            <div
              className="font-black text-emerald-800 leading-none"
              style={{ fontFamily: "'Tajawal', sans-serif", fontSize: "1.9rem" }}
            >
              {toArabicNums(count)}
            </div>
            <div className="text-[11px] text-emerald-600 mt-0.5 font-medium">
              من {toArabicNums(TARGET)} ذكر • اضغط للعدّ
            </div>

            {/* شريط التقدم */}
            <div className="mt-2 mx-3 h-2 rounded-full bg-white overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-teal-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[10px] text-emerald-500 mt-1">{toArabicNums(pct)}٪</div>
          </button>
        </div>
      </div>
    </div>
    )}
    </>
  );
}
