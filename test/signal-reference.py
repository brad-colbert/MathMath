# Makes test/signal-reference.json: SciPy's answers for the signal functions, on invented inputs.
# Run with SciPy installed: python3 test/signal-reference.py test/signal-reference.json
import json, numpy as np, scipy, scipy.signal as ss, sys
r=lambda a: [float(x) for x in np.asarray(a).ravel()]
c=lambda a: {'re': r(np.real(a)), 'im': r(np.imag(a))}
x=np.sin(np.arange(64)*0.37)+0.3*np.cos(np.arange(64)*2.1)+0.05*np.arange(64)
out={'scipy': scipy.__version__, 'x': r(x)}
out['windows']={f'{k}{n}': r(ss.get_window(k if k!='kaiser' else ('kaiser',4.5), n, fftbins=False)) for k in ['hann','hamming','blackman','kaiser'] for n in [1,2,7,8]}
out['fir']={
 'low31_0.1': r(ss.firwin(31, 0.1, fs=1)),
 'low30_0.2': r(ss.firwin(30, 0.2, fs=1)),
 'high31_0.2': r(ss.firwin(31, 0.2, pass_zero=False, fs=1)),
 'band41_0.1_0.25': r(ss.firwin(41, [0.1,0.25], pass_zero=False, fs=1)),
 'stop41_0.1_0.25': r(ss.firwin(41, [0.1,0.25], fs=1)),
 'low31_0.1_blackman': r(ss.firwin(31, 0.1, window='blackman', fs=1)),
}
out['butter']={}
for n in [1,2,3,4,5,8]:
  for kind,W in [('low',0.1),('high',0.2),('band',[0.05,0.2]),('stop',[0.1,0.3])]:
    if kind in('band','stop') and n>5: continue
    b,a=ss.butter(n,W,btype={'low':'lowpass','high':'highpass','band':'bandpass','stop':'bandstop'}[kind],fs=1)
    out['butter'][f'{kind}{n}']={'b':r(b),'a':r(a)}
b,a=ss.butter(4,0.1,fs=1)
out['lfilter_iir']=r(ss.lfilter(b,a,x))
h=ss.firwin(15,0.15,fs=1)
out['lfilter_fir']=r(ss.lfilter(h,[1],x))
out['filtfilt_iir']=r(ss.filtfilt(b,a,x))
out['filtfilt_fir']=r(ss.filtfilt(h,[1],x))
f=np.array([0,0.05,0.1,0.2,0.33,0.5])
out['freqz_iir']=c(ss.freqz(b,a,worN=2*np.pi*f)[1])
out['freqz_fir']=c(ss.freqz(h,[1],worN=2*np.pi*f)[1])
p=np.array([1,2,3,-1.]); q=np.array([0.5,-1,2])
pc=p+1j*np.array([0,1,-1,0.5]); qc=q+1j*np.array([1,0,-2])
out['convolve']=r(np.convolve(p,q)); out['correlate']=r(np.correlate(p,q,'full'))
out['convolve_c']=c(np.convolve(pc,qc)); out['correlate_c']=c(np.correlate(pc,qc,'full'))
big1=np.cos(np.arange(400)*0.1); big2=np.sin(np.arange(300)*0.05)
out['convolve_big_sum']=float(np.convolve(big1,big2).sum()); out['convolve_big_200']=float(np.convolve(big1,big2)[200])
json.dump(out, open(sys.argv[1],'w'), indent=0)
