/* 声音系统：Freesound CC0 音效 + WebAudio 合成补充音 */
const Sound=(()=>{
  let ac=null,voiceOn=true,sfxOn=true;
  const cache={};
  function ctx(){
    if(!ac){const C=window.AudioContext||window.webkitAudioContext;if(C)ac=new C()}
    if(ac&&ac.state==='suspended')ac.resume();
    return ac;
  }
  function unlock(){ctx()}
  ['pointerdown','touchstart','keydown'].forEach(e=>document.addEventListener(e,unlock,{once:true,capture:true}));

  function play(name,vol){
    if(!sfxOn||!name)return;
    try{
      if(!cache[name]){
        const a=new Audio('audio/'+name+'.mp3');
        a.preload='auto';cache[name]=a;
      }
      const a=cache[name];
      a.currentTime=0;a.volume=(vol==null?0.85:vol);
      const p=a.play();if(p&&p.catch)p.catch(()=>{});
    }catch(e){}
  }
  function tone(freq,dur,type,vol,delay){
    if(!sfxOn)return;
    const c=ctx();if(!c)return;
    try{
      const t0=c.currentTime+(delay||0);
      const o=c.createOscillator(),g=c.createGain();
      o.type=type||'sine';o.frequency.setValueAtTime(freq,t0);
      g.gain.setValueAtTime(0,t0);
      g.gain.linearRampToValueAtTime(vol||0.1,t0+0.012);
      g.gain.exponentialRampToValueAtTime(0.0001,t0+(dur||0.14));
      o.connect(g);g.connect(c.destination);
      o.start(t0);o.stop(t0+(dur||0.14)+0.03);
    }catch(e){}
  }
  function chord(freqs,dur,vol,type){
    freqs.forEach((f,i)=>tone(f,dur,type||'triangle',vol||0.08,i*0.055));
  }
  const api={
    unlock,
    setVoice(v){voiceOn=v},setSfx(v){sfxOn=v},
    isVoice(){return voiceOn},isSfx(){return sfxOn},
    click(){play('click',0.5)},
    tap(){play('tap',0.4)},
    tick(){play('tick',0.25)},
    open(){play('click',0.35);tone(700,0.08,'sine',0.04)},
    hover(){tone(980,0.035,'sine',0.018)},
    right(){play('success',0.8);tone(880,0.14,'sine',0.05,0.06)},
    wrong(){play('wrong',0.7);tone(220,0.18,'sine',0.05,0.04)},
    error(){play('error',0.6)},
    great(){play('achievement',0.75)},
    levelUp(){play('levelup',0.85);chord([523,659,784,1047],0.28,0.07)},
    goal(){play('achievement',0.9);chord([523,659,784,1047,1319],0.32,0.08)},
    gem(){play('coin',0.8);tone(1600,0.14,'sine',0.05,0.06)},
    start(){play('start',0.7)},
    again(){play('wrong',0.45)}
  };
  return api;
})();
