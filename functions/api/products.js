const items = [
  {id:"1001",title:"Комплект постельного белья",category:"Текстиль",price:1250,wholesale:1080,moq:10,seller:"Дом Текстиля",pavilion:"B-214",badge:"Новинка",image:"https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=900&q=80"},
  {id:"1002",title:"Набор полотенец 6 шт.",category:"Текстиль",price:790,wholesale:640,moq:12,seller:"Cotton Market",pavilion:"C-118",badge:"Опт",image:"https://images.unsplash.com/photo-1600369671236-e74521d4b6ad?auto=format&fit=crop&w=900&q=80"},
  {id:"1003",title:"Мягкая игрушка",category:"Игрушки",price:550,wholesale:420,moq:20,seller:"Toy City",pavilion:"E-307",badge:"Хит",image:"https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=900&q=80"},
  {id:"1004",title:"Набор кухонной посуды",category:"Посуда",price:2490,wholesale:2150,moq:6,seller:"Kitchen Pro",pavilion:"A-422",badge:"Акция",image:"https://images.unsplash.com/photo-1584990347449-ae0fa1a6c611?auto=format&fit=crop&w=900&q=80"},
  {id:"1005",title:"Плед 200×220 см",category:"Текстиль",price:990,wholesale:810,moq:10,seller:"Comfort Home",pavilion:"D-145",badge:"Новинка",image:"https://images.unsplash.com/photo-1580301762395-21ce84d00bc6?auto=format&fit=crop&w=900&q=80"},
  {id:"1006",title:"Органайзер для дома",category:"Товары для дома",price:390,wholesale:295,moq:30,seller:"Home Box",pavilion:"F-102",badge:"Опт",image:"https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80"}
];
export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const q = (u.searchParams.get("q") || "").toLowerCase();
  const c = (u.searchParams.get("category") || "").toLowerCase();
  const out = items.filter(p =>
    (!q || (p.title+" "+p.seller+" "+p.pavilion).toLowerCase().includes(q)) &&
    (!c || p.category.toLowerCase() === c)
  );
  return Response.json({items:out,total:out.length,source:"demo-adapter"});
}