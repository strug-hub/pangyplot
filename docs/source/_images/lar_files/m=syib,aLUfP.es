this._s=this._s||{};(function(_){var window=this;
try{
_.gEb=class{constructor(a){this.Bl=a}};
}catch(e){_._DumpException(e)}
try{
_.r("aLUfP");
var iEb;_.hEb=!1;iEb=function(){return _.ra()&&_.Pd.ZE()&&!navigator.userAgent.includes("GSA")};
_.Te(_.vXa,class extends _.Do{static Ta(){return{service:{window:_.Eo}}}constructor(a){super();this.window=a.service.window.get();this.Ba=this.Bl();this.Aa=window.orientation;this.oa=()=>{const b=this.Bl();var c=this.KWb()&&Math.abs(window.orientation)===90&&this.Aa===-1*window.orientation;this.Aa=window.orientation;if(b!==this.Ba||c){this.Ba=b;for(const d of this.listeners){c=new _.gEb(b);try{d(c)}catch(e){_.ea(e)}}}};this.listeners=new Set;this.window.addEventListener("resize",this.oa);this.KWb()&&
this.window.addEventListener("orientationchange",this.oa)}addListener(a){this.listeners.add(a)}removeListener(a){this.listeners.delete(a)}Bl(){if(iEb()){var a=_.cm(this.window);a=new _.Ul(a.width,Math.round(a.width*this.window.innerHeight/this.window.innerWidth))}else a=this.Kc()||(_.ra()?iEb():this.window.visualViewport)?_.cm(this.window):new _.Ul(this.window.innerWidth,this.window.innerHeight);return a.height<a.width}destroy(){this.window.removeEventListener("resize",this.oa);this.window.removeEventListener("orientationchange",
this.oa)}Kc(){return _.hEb}KWb(){return"orientation"in window}});
_.hEb=!0;
_.u();
}catch(e){_._DumpException(e)}
})(this._s);
// Google Inc.
