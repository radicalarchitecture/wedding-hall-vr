from PIL import Image
import numpy as np
A='/home/box/agent-data/agents/6223593f-d205-48be-bdfb-cfa32645061d/attachments/'
f=lambda h: Image.open(A+[x for x in __import__('os').listdir(A) if x.startswith(h)][0]).convert('RGB')
H=5.0; L=15.0; W=5.0
def trim(im,thr=235):
    a=np.asarray(im).astype(int); nw=a.min(axis=2)<thr
    r=np.where(nw.mean(1)>0.5)[0]; c=np.where(nw.mean(0)>0.5)[0]
    return im.crop((c.min(),r.min(),c.max()+1,r.max()+1))
def save(im,name,maxw=4096):
    if im.width>maxw: im=im.resize((maxw,round(im.height*maxw/im.width)),Image.LANCZOS)
    im.save('tex/'+name,quality=88,optimize=True,progressive=True); print(name,im.size)

# long walls: target pixel height; pad sides with sconce-free slice of own wall, mirrored alternately
def longwall(im,slice_x,name,ph=1200):
    im=trim(im)
    s=ph/im.height; im=im.resize((round(im.width*s),ph),Image.LANCZOS)
    tw=round(ph*L/H); pad=(tw-im.width)//2
    x0,x1=[round(v*s) for v in slice_x]; sl=im.crop((x0,0,x1,ph))
    out=Image.new('RGB',(tw,ph))
    out.paste(im,(pad,0))
    def fill(xs,xe,flip):
        x=xs;i=0
        while x<xe:
            t=sl if (i%2==0) else sl.transpose(Image.FLIP_LEFT_RIGHT)
            out.paste(t,(x,0)) if x+t.width<=xe else out.paste(t.crop((0,0,xe-x,ph)),(x,0)); x+=t.width;i+=1
    # left pad: build right-to-left so slice meets the image edge nicely
    fill(0,pad,False); fill(pad+im.width,tw,False)
    save(out,name); return im,s
ent=f('2c675ae8'); wat=f('d1a91393')
longwall(ent,(118,560),'wall_entrance.jpg')   # fluted maroon block (left)
longwall(wat,(150,196),'wall_water.jpg')      # sconce-free marble strip

# fluted maroon slice for end walls from entrance wall
e=trim(ent)
def endwall(img,name,ph=1659):
    img=trim(img); s=ph/img.height; img=img.resize((round(img.width*s),ph),Image.LANCZOS)
    tw=round(ph*W/H); pad=(tw-img.width)//2
    fs=e.crop((118,0,560,e.height)); fs=fs.resize((round(fs.width*ph/fs.height),ph),Image.LANCZOS)
    out=Image.new('RGB',(tw,ph))
    out.paste(fs.crop((fs.width-pad,0,fs.width,ph)),(0,0))
    out.paste(fs.crop((0,0,tw-pad-img.width,ph)),(pad+img.width,0))
    out.paste(img,(pad,0))
    # gold junction lines
    a=np.asarray(out).copy()
    for x in (pad,pad+img.width-1):
        a[:,max(0,x-3):x+3]=[196,150,80]
    save(Image.fromarray(a),name)
endwall(f('443e2b85'),'wall_niche.jpg')
endwall(f('33b8d891'),'wall_banquet.jpg')

# floor: exact 3:1
save(trim(f('3e61b411')),'floor.jpg')
# ceiling: trimmed ~3.69:1 fit to length, pad width with edge colour band
c=trim(f('824f82c4'))
cw=c.width; tgt_h=round(cw*W/L); pad=(tgt_h-c.height)//2
a=np.asarray(c)
top=a[2:6].mean(axis=(0,1)); 
out=Image.new('RGB',(cw,tgt_h),tuple(int(v) for v in top)); out.paste(c,(0,pad))
save(out,'ceiling.jpg')
