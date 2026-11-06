# Makes test/systems-reference.json: SciPy's and NumPy's answers for IIR design (digital and analog), root
# finding, analog frequency, step and impulse responses, and phase unwrapping, on invented inputs.
# Run with SciPy installed: python3 test/systems-reference.py test/systems-reference.json
# SciPy lists coefficients highest power first; MathMath lists them constant term first, so the tests reverse.
import json, numpy as np, scipy, scipy.signal as ss, sys
r=lambda a: [float(x) for x in np.asarray(a).ravel()]
c=lambda a: {'re': r(np.real(a)), 'im': r(np.imag(a))}
out={'scipy': scipy.__version__, 'numpy': np.__version__}

BT={'low':'lowpass','high':'highpass','band':'bandpass','stop':'bandstop'}
DIGITAL={'low':0.1,'high':0.2,'band':[0.05,0.2],'stop':[0.1,0.3]}
ANALOG={'low':1000.0,'high':2000.0,'band':[500.0,2000.0],'stop':[800.0,1500.0]}
def designs(fn, args, orders):
  res={}
  for n in orders:
    for kind in BT:
      if kind in ('band','stop') and n>5: continue
      b,a=fn(n,*args,DIGITAL[kind],btype=BT[kind],fs=1)
      res[f'digital_{kind}{n}']={'b':r(b),'a':r(a)}
      W=np.asarray(ANALOG[kind])*2*np.pi
      b,a=fn(n,*args,W,btype=BT[kind],analog=True)
      res[f'analog_{kind}{n}']={'b':r(b),'a':r(a)}
  return res
out['butter']=designs(ss.butter,[],[1,2,3,4,5,8])
out['cheby1']=designs(ss.cheby1,[1.0],[1,2,3,4,5,8])
out['cheby2']=designs(ss.cheby2,[40.0],[1,2,3,4,5,8])
out['ellip']=designs(ss.ellip,[1.0,40.0],[1,2,3,4,5,8])
out['bessel']=designs(lambda n,W,btype,fs=None,analog=False: ss.bessel(n,W,btype=btype,analog=analog,fs=fs,norm='phase'),[],[1,2,3,4,5,8,10,15])

# Roots: coefficients constant term first, as polyroots takes them.
polys={'cubic':[-6,11,-6,1],'complex':[5,2,1],'cube_plus_one':[1,0,0,1],'quartic':[24,-50,35,-10,1],
       'wide':[1e-6,1,1e3],'zero_root':[0,2,-3,1]}
bw=np.asarray(ss.butter(6,1,analog=True)[1])
polys['butter6']=list(bw[::-1])
out['roots']={k:{'c':r(v),**c(np.roots(np.asarray(v,float)[::-1]))} for k,v in polys.items()}

# Analog systems, highest first as SciPy wants them; times in seconds and frequencies in hertz.
systems={'second_order':([1.0],[1.0,0.4,1.0]),'with_zero':([1.0,2.0],[1.0,3.0,2.0]),'direct':([1.0,1.0],[1.0,2.0]),
         'butter3_1hz':tuple(ss.butter(3,2*np.pi,analog=True))}
t=np.linspace(0,10,41)
f=np.array([0.01,0.1,0.159,0.5,1.0,3.0])
out['systems']={}
for k,(b,a) in systems.items():
  b=np.asarray(b,float); a=np.asarray(a,float)
  out['systems'][k]={'b':r(b),'a':r(a),'t':r(t),'step':r(ss.step((b,a),T=t)[1]),'impulse':r(ss.impulse((b,a),T=t)[1]),
                     'f':r(f),'freqs':c(ss.freqs(b,a,worN=2*np.pi*f)[1])}
# Digital step and impulse: lfilter of ones and of a unit impulse.
b,a=ss.butter(3,0.1,fs=1)
n=np.arange(20)
out['digital']={'b':r(b),'a':r(a),'step':r(ss.lfilter(b,a,np.ones(20))),'impulse':r(ss.lfilter(b,a,(n==0).astype(float)))}

p=np.array([0,1,2,3,-3,-2.5,2.9,3.1,-3.1,0.5,6.5,-6.5])
out['unwrap']={'in':r(p),'out':r(np.unwrap(p))}

json.dump(out,open(sys.argv[1],'w'),indent=0)
