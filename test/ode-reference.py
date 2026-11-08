# MathMath: math on paper, in the browser.
# Copyright (C) 2026 Pelican Labs, LLC
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero
# General Public License as published by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
# implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
# License for more details.
#
# You should have received a copy of the GNU Affero General Public License along with this program. If not,
# see <https://www.gnu.org/licenses/>.

# Makes test/ode-reference.json: SciPy's answers for a non-stiff and two stiff systems, solved with very tight
# tolerances, for checking MathMath's ODE solvers. Invented starting values.
# Run with SciPy installed: python3 test/ode-reference.py test/ode-reference.json
import json, numpy as np, scipy, sys
from scipy.integrate import solve_ivp
r=lambda a: [float(x) for x in np.asarray(a).ravel()]
out={'scipy': scipy.__version__}

def solve(f, t, y0, method, jac=None):
  s=solve_ivp(f,(t[0],t[-1]),y0,method=method,t_eval=t,rtol=1e-13,atol=1e-15,jac=jac)
  assert s.success, s.message
  return [r(s.y[:,k]) for k in range(len(t))]

# Lotka–Volterra predator and prey, non-stiff.
lv=lambda t,y:[1.5*y[0]-y[0]*y[1], -3*y[1]+y[0]*y[1]]
t=np.linspace(0,10,6)
out['lotka']={'t':r(t),'y0':[10,5],'y':solve(lv,t,[10.0,5.0],'DOP853')}

# Robertson's chemical kinetics, stiff.
def rob(t,y): return [-0.04*y[0]+1e4*y[1]*y[2], 0.04*y[0]-1e4*y[1]*y[2]-3e7*y[1]**2, 3e7*y[1]**2]
def robj(t,y): return [[-0.04,1e4*y[2],1e4*y[1]],[0.04,-1e4*y[2]-6e7*y[1],-1e4*y[1]],[0,6e7*y[1],0]]
t=np.array([0,0.4,4,40.0])
out['robertson']={'t':r(t),'y0':[1,0,0],'y':solve(rob,t,[1.0,0,0],'Radau',robj)}

# Van der Pol with μ = 1000, stiff.
mu=1000
vdp=lambda t,y:[y[1], mu*(1-y[0]**2)*y[1]-y[0]]
vdpj=lambda t,y:[[0,1],[-2*mu*y[0]*y[1]-1, mu*(1-y[0]**2)]]
t=np.linspace(0,3000,7)
out['vanderpol']={'t':r(t),'y0':[2,0],'y':solve(vdp,t,[2.0,0],'Radau',vdpj)}

json.dump(out,open(sys.argv[1],'w'),indent=0)
