# Procedural Japanese seaside-town buildings (Takahama / Baishinji, Matsuyama) for the three.js game.
# Pure Python geometry (no bpy here): town_build.py turns the result into Blender meshes, bakes AO and exports.
#
# Frame = three.js house-local: +X along the street front, +Y up, +Z = the front (faces the street), 1 unit = 1 m,
# y = 0 is the ground floor slab (the game adds a podium below on slopes).
# Every face carries: colour (r, g, b), part (what the game may recolour per house), win (window id, glass only).
# Parts: 0 fixed colour · 1 main wall · 2 second wall colour · 3 roof · 4 sash/metal · 5 glass · 6 wood trim
# For parts 1-4 and 6 the game replaces the colour by the house palette times a brightness factor (colour[0]).
import math, random

WALL, WALL2, ROOF, SASH, GLASS, WOOD = 1, 2, 3, 4, 5, 6


def v_add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def v_sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def v_mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def v_dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def v_cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def v_len(a): return math.sqrt(v_dot(a, a))
def v_norm(a):
    l = v_len(a)
    return (a[0] / l, a[1] / l, a[2] / l) if l > 1e-9 else (0.0, 1.0, 0.0)


def F(f):   # brightness factor for recolourable parts (stored in colour[0])
    return (f, f, f)


class Mesh:
    def __init__(self):
        self.faces = []    # (pts, colour, part, win)
        self.ink = []      # pts lists (inverted-hull outline shell, rendered back-side)
        self.T = [((1, 0, 0), (0, 1, 0), (0, 0, 1), (0, 0, 0))]   # transform stack: x axis, y axis, z axis, origin

    # ---- transforms (rotation about Y + translation is all we need, plus generic frames)
    def tf(self, p):
        X, Y, Z, O = self.T[-1]
        return (O[0] + X[0] * p[0] + Y[0] * p[1] + Z[0] * p[2], O[1] + X[1] * p[0] + Y[1] * p[1] + Z[1] * p[2], O[2] + X[2] * p[0] + Y[2] * p[1] + Z[2] * p[2])
    def tv(self, v):
        X, Y, Z, O = self.T[-1]
        return (X[0] * v[0] + Y[0] * v[1] + Z[0] * v[2], X[1] * v[0] + Y[1] * v[1] + Z[1] * v[2], X[2] * v[0] + Y[2] * v[1] + Z[2] * v[2])
    def push(self, origin=(0, 0, 0), roty=0.0, X=None, Y=None, Z=None):
        if X is None:
            c, s = math.cos(roty), math.sin(roty)
            X, Y, Z = (c, 0, -s), (0, 1, 0), (s, 0, c)   # three.js rotation.y
        X, Y, Z = self.tv(X), self.tv(Y), self.tv(Z)
        self.T.append((X, Y, Z, self.tf(origin)))
    def pop(self): self.T.pop()

    # ---- primitives
    def poly(self, pts, col, part=0, win=0, facing=None):
        P = [self.tf(p) for p in pts]
        if facing is not None:
            n = v_cross(v_sub(P[1], P[0]), v_sub(P[2], P[0]))
            if len(P) > 3 and v_len(n) < 1e-9: n = v_cross(v_sub(P[2], P[0]), v_sub(P[3], P[0]))
            if v_dot(n, self.tv(facing)) < 0: P.reverse()
        self.faces.append((P, col, part, win))

    def box(self, cx, cy, cz, sx, sy, sz, col, part=0, skip='', win=0):
        """axis-aligned (in the current frame) box centred at (cx, cy, cz); skip: letters of faces to omit (t b f k l r)"""
        x0, x1, y0, y1, z0, z1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2
        if 't' not in skip: self.poly([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], col, part, win)
        if 'b' not in skip: self.poly([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], col, part, win)
        if 'f' not in skip: self.poly([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], col, part, win)
        if 'k' not in skip: self.poly([(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], col, part, win)
        if 'r' not in skip: self.poly([(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)], col, part, win)
        if 'l' not in skip: self.poly([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], col, part, win)

    def ink_box(self, cx, cy, cz, sx, sy, sz, e):
        x0, x1, y0, y1, z0, z1 = cx - sx / 2 - e, cx + sx / 2 + e, cy - sy / 2 - e, cy + sy / 2 + e, cz - sz / 2 - e, cz + sz / 2 + e
        for q in ([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
                  [(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], [(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)],
                  [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)]):
            self.ink.append([self.tf(p) for p in q])

    def beam(self, a, b, w, h, col, part=0, up=(0, 1, 0), caps=True):
        """box of section w x h from point a to point b (current frame); 'up' orients the h side"""
        d = v_sub(b, a); L = v_len(d)
        if L < 1e-6: return
        Z = v_mul(d, 1 / L); X = v_norm(v_cross(up, Z))
        if v_len(v_cross(up, Z)) < 1e-6: X = (1, 0, 0)
        Y = v_cross(Z, X)
        self.push(a, X=X, Y=Y, Z=Z)
        self.box(0, 0, L / 2, w, h, L, col, part, '' if caps else 'fk')
        self.pop()

    def tube(self, a, b, r, col, part=0, seg=6, caps=False):
        d = v_sub(b, a); L = v_len(d)
        if L < 1e-6: return
        Z = v_mul(d, 1 / L); up = (0, 1, 0) if abs(Z[1]) < 0.9 else (1, 0, 0)
        X = v_norm(v_cross(up, Z)); Y = v_cross(Z, X)
        self.push(a, X=X, Y=Y, Z=Z)
        ring = [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
        for i in range(seg):
            p, q = ring[i], ring[(i + 1) % seg]
            self.poly([(p[0], p[1], 0), (q[0], q[1], 0), (q[0], q[1], L), (p[0], p[1], L)], col, part,
                      facing=((p[0] + q[0]), (p[1] + q[1]), 0))
        if caps:
            self.poly([(x, y, L) for x, y in ring], col, part, facing=(0, 0, 1))
            self.poly([(x, y, 0) for x, y in ring], col, part, facing=(0, 0, -1))
        self.pop()

    def prism_y(self, pts2, y0, y1, col, part=0, top=True, bottom=False):
        """vertical prism over a convex CCW (seen from above, x/z) polygon"""
        n = len(pts2)
        for i in range(n):
            (ax, az), (bx, bz) = pts2[i], pts2[(i + 1) % n]
            self.poly([(ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az)], col, part, facing=(bz - az, 0, -(bx - ax)))
        if top: self.poly([(x, y1, z) for x, z in pts2], col, part, facing=(0, 1, 0))
        if bottom: self.poly([(x, y0, z) for x, z in pts2], col, part, facing=(0, -1, 0))


# ---------------------------------------------------------------------------------------------------------------
# palettes (base colours; parts 1-4/6 are recoloured per house in the game, these are for previews)
C_BASE = (0.55, 0.55, 0.54)        # concrete foundation band
C_CONC = (0.70, 0.70, 0.68)
C_DARK = (0.16, 0.16, 0.18)
C_GLASS = (0.20, 0.26, 0.32)
C_CURT = [(0.86, 0.82, 0.72), (0.80, 0.84, 0.86), (0.88, 0.78, 0.70), (0.75, 0.80, 0.70)]
C_DOOR = [(0.36, 0.27, 0.20), (0.52, 0.40, 0.28), (0.30, 0.30, 0.32), (0.62, 0.56, 0.46)]
C_WHITE = (0.90, 0.91, 0.90)
C_STEEL = (0.42, 0.44, 0.46)
LAUNDRY = [(0.92, 0.92, 0.88), (0.55, 0.70, 0.86), (0.90, 0.62, 0.62), (0.95, 0.85, 0.55), (0.62, 0.78, 0.62), (0.80, 0.80, 0.84), (0.30, 0.36, 0.52)]


# ---------------------------------------------------------------------------------------------------------------
# facades with real openings (no decals: windows are holes with reveals and recessed glass, so nothing z-fights)
class Facade:
    """a wall rectangle u in [0, L] (left to right seen from outside), y in [0, H]; origin/U/N in house frame"""
    def __init__(self, M, origin, U, N, L, H, lod):
        self.M, self.O, self.U, self.N, self.L, self.H, self.lod = M, origin, U, N, L, H, lod
        self.ops = []      # openings dict(u0, u1, y0, y1, kind, ...)
        self.bands = []    # (y0, y1, part, colour) colour bands
        self.cuts = set()  # extra y cuts (AO gradients)

    def P(self, u, y, o=0.0):
        return (self.O[0] + self.U[0] * u + self.N[0] * o, y, self.O[2] + self.U[2] * u + self.N[2] * o)

    def quad(self, u0, y0, u1, y1, o, col, part, win=0):
        self.M.poly([self.P(u0, y0, o), self.P(u1, y0, o), self.P(u1, y1, o), self.P(u0, y1, o)], col, part, win, facing=self.N)

    def box(self, u, y, o, su, sy, so, col, part=0):
        """box in facade coordinates: centre (u, y, o) with o outward"""
        M = self.M
        M.push(self.P(u, 0, o), X=self.U, Y=(0, 1, 0), Z=self.N)
        M.box(0, y, 0, su, sy, so, col, part, skip='k' if -0.05 <= o - so / 2 <= 0.005 else '')   # back face against the wall: never seen
        M.pop()

    def colour_at(self, y):
        for y0, y1, part, col in self.bands:
            if y0 - 1e-6 <= y <= y1 + 1e-6: return part, col
        return WALL, F(0.8)

    def build(self):
        ys = {0.0, self.H} | {y for b in self.bands for y in b[:2]} | self.cuts
        for o in self.ops: ys |= {o['y0'], o['y1']}
        ys = sorted(y for y in ys if 0 <= y <= self.H)
        for i in range(len(ys) - 1):
            y0, y1 = ys[i], ys[i + 1]
            if y1 - y0 < 1e-4: continue
            ym = (y0 + y1) / 2
            us = {0.0, self.L}
            inside = [o for o in self.ops if o['y0'] < ym < o['y1']]
            for o in inside: us |= {o['u0'], o['u1']}
            us = sorted(u for u in us if 0 <= u <= self.L)
            part, col = self.colour_at(ym)
            for j in range(len(us) - 1):
                u0, u1 = us[j], us[j + 1]
                if u1 - u0 < 1e-4: continue
                um = (u0 + u1) / 2
                if any(o['u0'] < um < o['u1'] for o in inside): continue
                self.quad(u0, y0, u1, y1, 0, col, part)
        for o in self.ops: self.opening(o)

    def opening(self, o):
        lod, u0, u1, y0, y1 = self.lod, o['u0'], o['u1'], o['y0'], o['y1']
        k = o['kind']; depth = o.get('depth', 0.12 if k != 'door' else 0.28)
        rcol = o.get('reveal', F(0.72)); rpart = o.get('rpart', WALL)
        # reveals (inner sides of the hole)
        P = self.P
        M = self.M
        M.poly([P(u0, y0, 0), P(u0, y0, -depth), P(u0, y1, -depth), P(u0, y1, 0)], rcol, rpart, facing=self.U)
        M.poly([P(u1, y0, -depth), P(u1, y0, 0), P(u1, y1, 0), P(u1, y1, -depth)], rcol, rpart, facing=v_mul(self.U, -1))
        M.poly([P(u0, y1, 0), P(u0, y1, -depth), P(u1, y1, -depth), P(u1, y1, 0)], rcol, rpart, facing=(0, -1, 0))
        M.poly([P(u0, y0, -depth), P(u0, y0, 0), P(u1, y0, 0), P(u1, y0, -depth)], rcol, rpart, facing=(0, 1, 0))
        win = o.get('win', 0)
        if k == 'door':
            dc = o.get('col', C_DOOR[0])
            self.quad(u0, y0, u1, y1, -depth, dc, 0)
            if lod == 0:
                um = (u0 + u1) / 2
                self.box(um, (y0 + y1) / 2 + 0.25, -depth + 0.01, 0.12, 1.2, 0.02, C_GLASS, GLASS)   # slit window
                self.box(u1 - 0.12, y0 + 1.0, -depth + 0.04, 0.03, 0.35, 0.05, (0.75, 0.72, 0.6), 0)   # handle
        elif k == 'shutter':   # shop roll shutter, half open: ribbed metal above, dark shop inside below
            ys = o.get('open', 1.0)
            self.quad(u0, y0, u1, y0 + ys, -depth - 0.6, (0.12, 0.11, 0.10), 0)
            self.quad(u0, y0 + ys, u1, y1, -depth, F(0.85), SASH)
            if lod <= 1:
                n = int((y1 - y0 - ys) / (0.1 if lod == 0 else 0.3))
                for i in range(1, n):
                    y = y0 + ys + i * (y1 - y0 - ys) / n
                    self.box((u0 + u1) / 2, y, -depth + 0.012, u1 - u0, 0.025, 0.025, F(0.7), SASH)
                self.box((u0 + u1) / 2, y0 + ys, -depth + 0.03, u1 - u0, 0.06, 0.06, F(0.6), SASH)
            # the shop interior box behind the open part: floor, back, sides (dark)
            d2 = depth + 0.6
            M.poly([P(u0, y0, -depth), P(u0, y0, -d2), P(u0, y0 + ys, -d2), P(u0, y0 + ys, -depth)], (0.2, 0.18, 0.16), 0, facing=self.U)
            M.poly([P(u1, y0, -d2), P(u1, y0, -depth), P(u1, y0 + ys, -depth), P(u1, y0 + ys, -d2)], (0.2, 0.18, 0.16), 0, facing=v_mul(self.U, -1))
            M.poly([P(u0, y0 + ys, -depth), P(u0, y0 + ys, -d2), P(u1, y0 + ys, -d2), P(u1, y0 + ys, -depth)], (0.15, 0.14, 0.13), 0, facing=(0, -1, 0))
        else:
            # glass: two panes (sliding window); one pane shows a curtain behind it
            um = (u0 + u1) / 2
            gc = o.get('glass', C_GLASS); cc = o.get('curtain')
            self.quad(u0, y0, um, y1, -depth, gc if not o.get('flip') else (cc or gc), GLASS, win)
            self.quad(um, y0, u1, y1, -depth, (cc or gc) if not o.get('flip') else gc, GLASS, win)
            if lod == 0:
                fw = 0.045
                sc = o.get('sash', F(0.8))
                self.box(um, (y0 + y1) / 2, -depth + 0.03, 0.05, y1 - y0, 0.05, sc, SASH)
                for (uu, yy, su, sy) in ((u0 + fw / 2, (y0 + y1) / 2, fw, y1 - y0), (u1 - fw / 2, (y0 + y1) / 2, fw, y1 - y0),
                                         (um, y1 - fw / 2, u1 - u0, fw), (um, y0 + fw / 2, u1 - u0, fw)):
                    self.box(uu, yy, -depth + 0.025, su, sy, 0.05, sc, SASH)
                if k == 'tall' and y1 - y0 > 1.6:
                    self.box(um, y0 + 0.45, -depth + 0.02, u1 - u0, 0.04, 0.03, sc, SASH)
            if lod <= 1 and k in ('std', 'small'):
                self.box(um, y0 - 0.03, 0.04, u1 - u0 + 0.12, 0.05, 0.1, F(0.75), SASH)    # sill flashing
        # extras around windows
        if o.get('lattice') and lod <= 1:
            n = 5 if lod == 0 else 3
            for i in range(n):
                uu = u0 + (i + 0.5) * (u1 - u0) / n
                self.box(uu, (y0 + y1) / 2, 0.05, 0.03 if lod == 0 else 0.05, y1 - y0 + 0.08, 0.03, F(0.8), SASH)  # lattice bar
            self.box((u0 + u1) / 2, y1 + 0.03, 0.05, u1 - u0 + 0.08, 0.04, 0.05, F(0.8), SASH)
            self.box((u0 + u1) / 2, y0 - 0.03, 0.05, u1 - u0 + 0.08, 0.04, 0.05, F(0.8), SASH)
        if o.get('amado') and lod <= 1:   # rain-shutter box beside the window and the rail above
            side = o['amado']; bw = (u1 - u0) * 0.5
            uc = u1 + bw / 2 if side > 0 else u0 - bw / 2
            sc = o.get('amado_col', F(0.8)); sp = o.get('amado_part', SASH)
            self.box(uc, (y0 + y1) / 2 + 0.03, 0.09, bw, y1 - y0 + 0.16, 0.18, sc, sp)
            self.box((u0 + u1) / 2, y1 + 0.06, 0.06, u1 - u0, 0.1, 0.12, sc, sp)
        if o.get('canopy') and lod <= 1:   # small metal hood over door/window
            self.box((u0 + u1) / 2, y1 + 0.18, 0.4, u1 - u0 + 0.5, 0.07, 0.8, F(0.65), SASH)
            if lod == 0:
                for uu in (u0 - 0.2, u1 + 0.2): self.box(uu, y1 + 0.08, 0.6, 0.03, 0.03, 0.4, F(0.6), SASH)


# ---------------------------------------------------------------------------------------------------------------
# roofs
class RoofPlane:
    """roof plane: O = eave point at u = 0, U along the eave, V up the slope (unit, 3D), N = outward normal.
    u-range at slope distance v: [ul0 + kl*v, ur0 - kr*v] (k > 0 for hips), v in [0, Vlen]"""
    def __init__(self, O, U, V, Vlen, ul0, ur0, kl, kr):
        self.O, self.U, self.V, self.Vlen, self.ul0, self.ur0, self.kl, self.kr = O, U, V, Vlen, ul0, ur0, kl, kr
        self.N = v_norm(v_cross(V, U))
        if self.N[1] < 0: self.N = v_mul(self.N, -1)
    def P(self, u, v, h=0.0):
        return v_add(v_add(v_add(self.O, v_mul(self.U, u)), v_mul(self.V, v)), v_mul(self.N, h))
    def urange(self, v): return self.ul0 + self.kl * v, self.ur0 - self.kr * v


def roof_plane(M, rp, lod, tile, slab=0.12, eave_wave=True, col_factor=1.0, seam_w=0.45):
    """tiles on a roof plane. tile: 'kawara' (wavy J/S tiles), 'metal' (standing seams), 'slate' (flat)"""
    rc = F(0.78 * col_factor)
    a = 0.035 if tile == 'kawara' else 0.0
    if tile == 'kawara' and lod <= 1:
        # a flat under-layer just below the tile troughs: fills the staircase gaps along the hips
        ul0, ur0 = rp.urange(0); ul1, ur1 = rp.urange(rp.Vlen)
        M.poly([rp.P(ul0, 0, -a - 0.006), rp.P(ur0, 0, -a - 0.006), rp.P(ur1, rp.Vlen, -a - 0.006)] + ([rp.P(ul1, rp.Vlen, -a - 0.006)] if ur1 - ul1 > 1e-3 else []), F(0.5 * col_factor), ROOF, facing=rp.N)
        cw = 0.30 if lod == 0 else 0.45
        prof = [0, 0.25, 0.5, 0.75, 1.0] if lod == 0 else [0, 0.5, 1.0]
        hfun = (lambda t: a * math.cos(2 * math.pi * t)) if lod == 0 else (lambda t: a * (1 if t in (0, 1.0) else -1))
        u = rp.ul0
        umin, umax = rp.ul0, rp.ur0
        n = max(1, int(round((umax - umin) / cw)))
        cw = (umax - umin) / n
        for i in range(n):
            ua, ub = umin + i * cw, umin + (i + 1) * cw
            uc = (ua + ub) / 2
            vmax = rp.Vlen
            if rp.kl > 1e-6: vmax = min(vmax, (uc - rp.ul0) / rp.kl)
            if rp.kr > 1e-6: vmax = min(vmax, (rp.ur0 - uc) / rp.kr)
            if vmax < 0.05: continue
            for k in range(len(prof) - 1):
                u0, u1 = ua + prof[k] * cw, ua + prof[k + 1] * cw
                h0, h1 = hfun(prof[k]), hfun(prof[k + 1])
                M.poly([rp.P(u0, 0, h0), rp.P(u1, 0, h1), rp.P(u1, vmax, h1), rp.P(u0, vmax, h0)], rc, ROOF, facing=rp.N)
                if eave_wave:   # the wavy eave edge (軒瓦 seen end-on)
                    M.poly([rp.P(u0, 0, -slab), rp.P(u1, 0, -slab), rp.P(u1, 0, h1), rp.P(u0, 0, h0)], F(0.7 * col_factor), ROOF, facing=v_mul(rp.V, -1))
            if lod == 0 and rp.kl < 1e-6 and rp.kr < 1e-6:
                pass
        if lod == 0:   # tile courses: a shallow step every 0.3 m up the slope, across the whole plane
            nv = int(rp.Vlen / 0.3)
            for j in range(1, nv):
                v = j * rp.Vlen / nv
                ul, ur = rp.urange(v)
                if ur - ul < 0.2: continue
                M.poly([rp.P(ul, v, a - 0.012), rp.P(ur, v, a - 0.012), rp.P(ur, v, a + 0.022), rp.P(ul, v, a + 0.022)], F(0.62 * col_factor), ROOF, facing=v_mul(rp.V, -1))
                ul2, ur2 = rp.urange(v + 0.22)
                M.poly([rp.P(ul, v, a + 0.022), rp.P(ur, v, a + 0.022), rp.P(ur2, v + 0.22, a - 0.004), rp.P(ul2, v + 0.22, a - 0.004)], rc, ROOF, facing=rp.N)
    else:
        # flat surface (far LOD, metal, slate)
        ul0, ur0 = rp.urange(0); ul1, ur1 = rp.urange(rp.Vlen)
        pts = [rp.P(ul0, 0, a * 0.5), rp.P(ur0, 0, a * 0.5)]
        pts += [rp.P(ur1, rp.Vlen, a * 0.5)] + ([rp.P(ul1, rp.Vlen, a * 0.5)] if ur1 - ul1 > 1e-3 else [])
        M.poly(pts, rc, ROOF, facing=rp.N)
        if tile == 'metal' and lod <= 1:   # standing seams
            n = int((rp.ur0 - rp.ul0) / seam_w)
            for i in range(1, n):
                u = rp.ul0 + i * (rp.ur0 - rp.ul0) / n
                vmax = rp.Vlen
                if rp.kl > 1e-6: vmax = min(vmax, (u - rp.ul0) / rp.kl)
                if rp.kr > 1e-6: vmax = min(vmax, (rp.ur0 - u) / rp.kr)
                if vmax < 0.1: continue
                M.beam(rp.P(u, 0, 0.02), rp.P(u, vmax, 0.02), 0.035, 0.05, F(0.7 * col_factor), ROOF, up=rp.N)
        if eave_wave:   # eave edge
            M.poly([rp.P(ul0, 0, -slab), rp.P(ur0, 0, -slab), rp.P(ur0, 0, a * 0.5), rp.P(ul0, 0, a * 0.5)], F(0.66 * col_factor), ROOF, facing=v_mul(rp.V, -1))
    # soffit (underside) and the verge edges of non-hip sides
    ul0, ur0 = rp.urange(0); ul1, ur1 = rp.urange(rp.Vlen)
    sp = [rp.P(ul0, 0, -slab), rp.P(ur0, 0, -slab), rp.P(ur1, rp.Vlen, -slab)] + ([rp.P(ul1, rp.Vlen, -slab)] if ur1 - ul1 > 1e-3 else [])
    M.poly(sp, F(0.85), WOOD, facing=v_mul(rp.N, -1))
    if rp.kl < 1e-6:
        M.poly([rp.P(ul0, 0, -slab), rp.P(ul0, 0, a), rp.P(ul1, rp.Vlen, a), rp.P(ul1, rp.Vlen, -slab)], F(0.66), ROOF, facing=v_mul(rp.U, -1))
    if rp.kr < 1e-6:
        M.poly([rp.P(ur0, 0, -slab), rp.P(ur0, 0, a), rp.P(ur1, rp.Vlen, a), rp.P(ur1, rp.Vlen, -slab)], F(0.66), ROOF, facing=rp.U)


def ink_plane(M, rp, e, slab=0.12):
    """outline shell for a roof plane: the plane inflated by e (top, bottom, rim)"""
    ul0, ur0 = rp.urange(0); ul1, ur1 = rp.urange(rp.Vlen)
    def P(u, v, h): return rp.P(u, v, h)
    hi, lo = 0.05 + e, -slab - e
    top = [P(ul0 - e, -e, hi), P(ur0 + e, -e, hi), P(ur1 + e, rp.Vlen, hi), P(ul1 - e, rp.Vlen, hi)]
    bot = [P(ul0 - e, -e, lo), P(ur0 + e, -e, lo), P(ur1 + e, rp.Vlen, lo), P(ul1 - e, rp.Vlen, lo)]
    def add(q, facing):
        n = v_cross(v_sub(q[1], q[0]), v_sub(q[2], q[0]))
        if v_len(n) < 1e-9 and len(q) > 3: n = v_cross(v_sub(q[2], q[0]), v_sub(q[3], q[0]))
        if v_dot(n, facing) < 0: q = q[::-1]
        M.ink.append([M.tf(p) for p in q])
    add(top, rp.N); add(bot, v_mul(rp.N, -1))
    add([bot[0], bot[1], top[1], top[0]], v_mul(rp.V, -1))
    add([bot[1], bot[2], top[2], top[1]], rp.U)
    add([bot[3], bot[0], top[0], top[3]], v_mul(rp.U, -1))


def ridge(M, a, b, lod, col_factor=1.0, size=0.26, oni=True, kind='main'):
    """ridge along a->b (both on the ridge line): stacked noshi tiles + round cap, onigawara at the ends"""
    up = (0, 1, 0)
    if lod >= 2:
        M.beam(v_add(a, (0, 0.08, 0)), v_add(b, (0, 0.08, 0)), size, size * 0.8, F(0.6 * col_factor), ROOF, up)
        return
    if lod == 0 and kind == 'main':
        for i, (w, h) in enumerate(((size * 1.15, 0.07), (size * 1.0, 0.07), (size * 0.85, 0.07))):
            y = 0.04 + i * 0.075
            M.beam(v_add(a, (0, y, 0)), v_add(b, (0, y, 0)), w, h, F(0.62 * col_factor if i % 2 else 0.7 * col_factor), ROOF, up)
        M.tube(v_add(a, (0, 0.30, 0)), v_add(b, (0, 0.30, 0)), 0.09, F(0.58 * col_factor), ROOF, seg=6)
    else:
        M.beam(v_add(a, (0, 0.10, 0)), v_add(b, (0, 0.10, 0)), size, 0.16 if kind == 'main' else 0.12, F(0.64 * col_factor), ROOF, up)
        M.tube(v_add(a, (0, 0.2 if kind == 'main' else 0.17, 0)), v_add(b, (0, 0.2 if kind == 'main' else 0.17, 0)), 0.08 if lod == 0 else 0.09, F(0.58 * col_factor), ROOF, seg=6 if lod == 0 else 4)
    if oni and kind == 'main':   # onigawara: the ornamental end tiles
        d = v_norm(v_sub(b, a))
        for p, s in ((a, -1), (b, 1)):
            c = v_add(p, v_mul(d, s * 0.02))
            X = v_norm(v_cross((0, 1, 0), d))
            M.push(c, X=X, Y=(0, 1, 0), Z=d)
            M.box(0, 0.24, 0, 0.46, 0.44, 0.12, F(0.5 * col_factor), ROOF)
            if lod == 0:
                M.box(0, 0.52, 0, 0.28, 0.14, 0.1, F(0.5 * col_factor), ROOF)
                M.box(0, 0.24, s * 0.07, 0.2, 0.2, 0.04, F(0.42 * col_factor), ROOF)
            M.pop()


class Roof:
    """roof over a w x d wall rectangle (house frame), top of walls at H"""
    def __init__(self, kind, w, d, H, pitch=0.45, ov=0.6, og=0.45, ridge_x=None, front_ov=None, back_ov=None):
        self.kind, self.w, self.d, self.H, self.pitch, self.ov, self.og = kind, w, d, H, pitch, ov, og
        self.ridge_x = (w >= d) if ridge_x is None else ridge_x
        self.fov = ov if front_ov is None else front_ov
        self.bov = ov if back_ov is None else back_ov
        self.planes = []
        L, S = (w, d) if self.ridge_x else (d, w)
        self.L, self.S = L, S
        k = math.sqrt(1 + pitch * pitch)
        y0 = H + 0.15
        if kind == 'shed':
            # single slope rising from the front (+Z) to the back; ridge_x forced
            S = d; L = w
            run = S + self.fov + self.bov
            O = (-L / 2 - og, y0 - self.fov * pitch, d / 2 + self.fov)
            V = (0, pitch / k, -1 / k)
            self.planes.append(RoofPlane(O, (1, 0, 0), V, run * k, 0, L + 2 * og, 0, 0))
            self.top = y0 + (S + self.bov) * pitch
            self.ridge = None
            return
        half = S / 2
        yr = y0 + half * pitch
        self.yr = yr
        def frame(p):   # roof frame (along-ridge l, across s, y) -> house frame
            l, y, s = p
            return (l, y, s) if self.ridge_x else (s, y, -l)
        def fvec(v): return frame(v)
        for side in (1, -1):
            ov_s = self.fov if side == 1 else self.bov
            if not self.ridge_x: ov_s = ov
            run = half + ov_s
            O = frame((-L / 2 - (og if kind == 'gable' else ov), y0 - ov_s * pitch, side * (half + ov_s)))
            U = fvec((1, 0, 0))
            V = fvec((0, pitch / k, -side / k))
            if side == -1:
                O = frame((L / 2 + (og if kind == 'gable' else ov), y0 - ov_s * pitch, side * (half + ov_s)))
                U = fvec((-1, 0, 0))
            Lr = L + 2 * (og if kind == 'gable' else ov)
            if kind == 'gable':
                self.planes.append(RoofPlane(O, U, V, run * k, 0, Lr, 0, 0))
            else:   # hip: 45 degree hips in plan
                kk = 1 / k * (1.0)   # du per unit slope distance = run/len ... u shrinks by 1 per 1 m horizontal run
                self.planes.append(RoofPlane(O, U, V, run * k, 0, Lr, 1 / k, 1 / k))
        if kind == 'hip':
            for side in (1, -1):
                run = half + ov
                O = frame((side * (L / 2 + ov), y0 - ov * pitch, -side * (half + ov) * (1)))
                # end plane: eave along s; U goes along s so that N points out (+l side)
                U = fvec((0, 0, side)) if True else None
                V = fvec((-side * pitch * 0 - side / k, pitch / k, 0))
                O = frame((side * (L / 2 + ov), y0 - ov * pitch, -side * (half + ov)))
                self.planes.append(RoofPlane(O, U, V, run * k, 0, S + 2 * ov, 1 / k, 1 / k))
        rl = (L / 2 + og) if kind == 'gable' else max(0.0, (L - S) / 2)
        self.ridge = (frame((-rl, yr, 0)), frame((rl, yr, 0)))
        self.hips = []
        if kind == 'hip':
            for sl in (1, -1):
                for ss in (1, -1):
                    self.hips.append((frame((sl * rl, yr, 0)), frame((sl * (L / 2 + ov), y0 - ov * pitch, ss * (half + ov)))))
        self.top = yr
        self.frame = frame

    def build(self, M, lod, tile='kawara', col_factor=1.0, ink=0.0):
        for rp in self.planes:
            roof_plane(M, rp, lod, tile, col_factor=col_factor)
            if ink > 0: ink_plane(M, rp, ink)
        if self.kind in ('gable', 'hip') and self.ridge:
            if tile == 'kawara':
                ridge(M, self.ridge[0], self.ridge[1], lod, col_factor, oni=True)
                for a, b in getattr(self, 'hips', []):
                    ridge(M, a, b, lod, col_factor, size=0.22, kind='hip')
                    if lod <= 1:   # small onigawara at the hip foot
                        M.box(b[0], b[1] + 0.12, b[2], 0.2, 0.22, 0.2, F(0.5 * col_factor), ROOF)
            else:
                a, b = self.ridge
                M.beam(v_add(a, (0, 0.05, 0)), v_add(b, (0, 0.05, 0)), 0.3, 0.08, F(0.7 * col_factor), ROOF)
                for a, b in getattr(self, 'hips', []): M.beam(v_add(a, (0, 0.04, 0)), v_add(b, (0, 0.04, 0)), 0.22, 0.06, F(0.7 * col_factor), ROOF)

    def gable_walls(self, M, col, part):
        """the triangles between the wall tops and a gable roof (or the shed roof's sides)"""
        H, y0 = self.H, self.H + 0.15
        if self.kind == 'gable':
            for side in (1, -1):
                l = side * self.L / 2
                a, b, c = self.frame((l, H, -self.S / 2)), self.frame((l, H, self.S / 2)), self.frame((l, self.yr - 0.05, 0))
                n = self.frame((side, 0, 0))
                M.poly([a, b, c], col, part, facing=n)
        elif self.kind == 'shed':
            w, d, p = self.w, self.d, self.pitch
            top_b = y0 + d * p - 0.06
            for side in (1, -1):
                x = side * w / 2
                M.poly([(x, H, d / 2), (x, H, -d / 2), (x, top_b, -d / 2), (x, y0 - 0.02, d / 2)], col, part, facing=(side, 0, 0))
            M.poly([(w / 2, H, -d / 2), (-w / 2, H, -d / 2), (-w / 2, top_b, -d / 2), (w / 2, top_b, -d / 2)], col, part, facing=(0, 0, -1))

    def eave_lines(self):
        """(a, b, outward) eave edges in the house frame for gutters"""
        out = []
        for rp in self.planes:
            ul, ur = rp.urange(0)
            out.append((rp.P(ul, 0, -0.1), rp.P(ur, 0, -0.1), v_mul(rp.V, -1)))
        return out


# ---------------------------------------------------------------------------------------------------------------
# small parts
def ac_unit(M, x, y, z, rot, lod):
    M.push((x, y, z), roty=rot)
    M.box(0, 0.3, 0, 0.8, 0.58, 0.3, (0.86, 0.87, 0.85), 0)
    if lod == 0:
        M.poly([(0.18 + 0.2 * math.cos(a), 0.32 + 0.2 * math.sin(a), 0.152) for a in [i * math.pi / 4 for i in range(8)]], (0.25, 0.26, 0.27), 0, facing=(0, 0, 1))
        M.box(0, 0.0, 0, 0.7, 0.04, 0.32, (0.4, 0.4, 0.4), 0)
    M.pop()


def laundry(M, x0, x1, y, z, lod, rnd, n=None):
    """two poles across with laundry hanging"""
    for dz in (-0.12, 0.12):
        M.tube((x0, y, z + dz), (x1, y, z + dz), 0.018 if lod == 0 else 0.03, (0.75, 0.75, 0.72), 0, seg=4)
    n = n if n is not None else rnd.randint(2, 6)
    for i in range(n):
        if rnd.random() < 0.25: continue
        xc = x0 + (i + 0.5) * (x1 - x0) / n
        w, h = rnd.uniform(0.3, 0.55), rnd.uniform(0.4, 0.75)
        c = LAUNDRY[rnd.randrange(len(LAUNDRY))]
        M.box(xc, y - h / 2 - 0.02, z + (0.12 if i % 2 else -0.12), w, h, 0.03, c, 0)


def antenna(M, x, y, z, lod, rot=0.0):
    t = 0.02 if lod == 0 else 0.04
    M.beam((x, y, z), (x, y + 1.9, z), t * 1.5, t * 1.5, (0.62, 0.62, 0.6), 0)
    M.push((x, y + 1.6, z), roty=rot)
    M.beam((0, 0, -0.6), (0, 0, 0.6), t, t, (0.62, 0.62, 0.6), 0)
    for i in range(5 if lod == 0 else 3):
        zz = -0.5 + i * (1.0 / (4 if lod == 0 else 2))
        w = 0.55 - i * 0.05
        M.beam((-w / 2, 0, zz), (w / 2, 0, zz), t * 0.8, t * 0.8, (0.62, 0.62, 0.6), 0)
    M.pop()


def solar_heater(M, rp, uc, vc, lod):
    """太陽熱温水器 on a roof plane: a tilted collector and a tank on top"""
    w, h = 2.0, 1.1
    a = rp.P(uc - w / 2, vc, 0.06); b = rp.P(uc + w / 2, vc, 0.06)
    up = rp.V
    c = v_add(a, (0, 0, 0))
    # collector: a box lying on the plane (slightly steeper is not worth it)
    M.push(rp.P(uc, vc + h / 2, 0.1), X=rp.U, Y=rp.N, Z=v_mul(rp.V, -1))
    M.box(0, 0, 0, w, 0.08, h, (0.18, 0.22, 0.32), 0)
    if lod == 0:
        for i in range(1, 6): M.box(-w / 2 + i * w / 6, 0.045, 0, 0.02, 0.02, h, (0.7, 0.7, 0.7), 0)
    M.pop()
    tank_c = rp.P(uc, vc + h + 0.2, 0.3)
    M.tube(v_add(tank_c, v_mul(rp.U, -w / 2)), v_add(tank_c, v_mul(rp.U, w / 2)), 0.22, (0.86, 0.86, 0.84), 0, seg=8 if lod == 0 else 5, caps=True)


def gutters(M, roof, lod, H):
    if lod > 0: return
    corners = []
    for a, b, o in roof.eave_lines():
        a2 = v_add(a, v_mul(o, -0.02)); b2 = v_add(b, v_mul(o, -0.02))
        M.beam(a2, b2, 0.11, 0.09, F(0.85), SASH)
        corners.append(a2)
    return corners


def downpipe(M, top, ybot, lod, wall_pt):
    if lod > 0: return
    M.beam(top, (wall_pt[0], top[1] - 0.25, wall_pt[2]), 0.06, 0.06, F(0.85), SASH)
    M.beam((wall_pt[0], top[1] - 0.25, wall_pt[2]), (wall_pt[0], ybot, wall_pt[2]), 0.07, 0.07, F(0.85), SASH)


def railing(M, x0, x1, y, z, lod, style, rnd, h=1.0, col=None, along='x'):
    """balcony railing along x at depth z (house frame) — style 'bars' (aluminium balusters) or 'panel'"""
    col = col or F(0.86)
    L = x1 - x0
    if lod >= 2 or style == 'panel':
        M.box((x0 + x1) / 2, y + h * 0.5, z, L, h * (0.92 if lod < 2 else 1.0), 0.05, (0.78, 0.80, 0.80) if style == 'panel' else col, 0 if style == 'panel' else SASH)
        if lod < 2: M.box((x0 + x1) / 2, y + h, z, L + 0.04, 0.06, 0.08, col, SASH)
        return
    M.box((x0 + x1) / 2, y + h, z, L + 0.04, 0.06, 0.08, col, SASH)
    M.box((x0 + x1) / 2, y + 0.1, z, L, 0.04, 0.05, col, SASH)
    step = 0.12 if lod == 0 else 0.3
    n = max(2, int(L / step))
    for i in range(n + 1):
        x = x0 + i * L / n
        M.box(x, y + 0.55, z, 0.025 if lod == 0 else 0.04, 0.9, 0.025 if lod == 0 else 0.04, col, SASH, skip='tb')


def balcony(M, x0, x1, y, zwall, depth, lod, rnd, style='bars', laundry_p=0.7, futon_p=0.2):
    zc = zwall + depth / 2
    M.box((x0 + x1) / 2, y - 0.08, zc, x1 - x0, 0.16, depth, C_CONC, 0)
    if lod <= 1:
        for x in (x0, x1):   # side brackets / side railings
            M.box(x, y + 0.5, zc, 0.05, 1.0, depth, F(0.86) if style == 'bars' else (0.78, 0.80, 0.80), SASH if style == 'bars' else 0)
    railing(M, x0, x1, y, zwall + depth, lod, style, rnd)
    if lod <= 1 and rnd.random() < laundry_p:
        laundry(M, x0 + 0.2, x1 - 0.2, y + 1.65, zwall + depth * 0.55, lod, rnd)
        for x in (x0 + 0.15, x1 - 0.15):   # pole hangers on the wall
            M.beam((x, y + 1.65, zwall), (x, y + 1.65, zwall + depth * 0.7), 0.03, 0.03, F(0.8), SASH)
    if lod <= 1 and rnd.random() < futon_p:
        fx = rnd.uniform(x0 + 0.9, x1 - 0.9)
        c = LAUNDRY[rnd.randrange(len(LAUNDRY))]
        M.box(fx, y + 0.8, zwall + depth + 0.06, 1.3, 0.55, 0.06, c, 0)
        M.box(fx, y + 1.04, zwall + depth - 0.05, 1.3, 0.06, 0.28, c, 0)


# ---------------------------------------------------------------------------------------------------------------
# window layout per wall
def window_row(L, y0, kinds, rnd, margin=0.6, spacing=None):
    """choose window openings along a wall: list of (u0, u1, y0, y1, kind)"""
    out = []
    # slots ~2.4 m wide
    n = max(1, int((L - 2 * margin) / (spacing or 2.4)))
    slot = (L - 2 * margin) / n
    for i in range(n):
        k = kinds[i % len(kinds)] if isinstance(kinds, list) else kinds
        if k is None: continue
        if k == 'rand': k = rnd.choice(['std', 'std', 'std', 'small', 'tall', None])
        if k is None: continue
        w = {'std': min(1.65, slot - 0.4), 'small': 0.6, 'tall': min(1.75, slot - 0.3), 'door': 0.9}[k]
        h = {'std': 1.1, 'small': 0.55, 'tall': 1.9, 'door': 2.0}[k]
        sill = {'std': 0.9, 'small': 1.3, 'tall': 0.08, 'door': 0.0}[k]
        uc = margin + (i + 0.5) * slot + rnd.uniform(-0.15, 0.15) * (slot - w)
        if w < 0.4: continue
        out.append((uc - w / 2, uc + w / 2, y0 + sill, y0 + sill + h, k))
    return out
