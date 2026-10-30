package vn.fs.service;

import static vn.fs.service.ChatTool.Parameter.*;
import java.util.*;
import java.util.function.BiFunction;
import java.util.stream.Collectors;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import vn.fs.dto.chat.*;
import vn.fs.entity.Product;
import vn.fs.repository.ProductRepository;

/** Individual beans are discovered automatically; adding a capability does not change the orchestrator. */
@Configuration
public class ChatBuiltinTools {
    private final ProductRepository products;
    private final ChatRetrievalService data;
    private final ChatIntentService language;
    private final ChatOrderSupportService orders;
    private final ChatPolicyService policies;
    private OrderCancellationService cancellation;
    @org.springframework.beans.factory.annotation.Autowired
    public void setCancellation(OrderCancellationService value){cancellation=value;}
    public ChatBuiltinTools(ProductRepository products, ChatRetrievalService data, ChatIntentService language,
            ChatOrderSupportService orders, ChatPolicyService policies) {
        this.products=products; this.data=data; this.language=language; this.orders=orders; this.policies=policies;
    }
    private ChatTool tool(String name, String description, Map<String,ChatTool.Parameter> parameters,
            BiFunction<JsonNode,ChatTool.Context,ChatTool.Result> handler) {
        return new ChatTool() {
            public String name() { return name; }
            public String description() { return description; }
            public Map<String,Parameter> parameters() { return parameters; }
            public Result execute(JsonNode arguments, Context context) { return handler.apply(arguments,context); }
        };
    }
    private Map<String,ChatTool.Parameter> referenceParameters() {
        Map<String,ChatTool.Parameter> p=new LinkedHashMap<>();
        p.put("productId", integer("ID xác thực trong context, không đoán",1,9007199254740991L));
        p.put("title", text("Tên sách cụ thể cần tìm, không thêm câu yêu cầu"));
        p.put("source", choice("Nguồn tham chiếu danh sách: kết quả hoặc giỏ thiết bị", "results","cart"));
        p.put("reference", choice("Tham chiếu danh sách đã hiển thị; selection là danh sách đang chọn", "focus","first","second","third","last","selection","cheapest","most_expensive"));
        return p;
    }
    @Bean public ChatTool searchProducts() {
        Map<String,ChatTool.Parameter> p=new LinkedHashMap<>();
        p.put("query",text("Chủ đề/từ khóa sách, không chứa giá, rating hoặc số lượng"));
        p.put("title",text("Tên sách cụ thể cần khớp chính xác"));
        p.put("titleContains",text("Từ hoặc cụm từ độc lập có trong tên sách; AI không khớp chữ nằm trong Blockchain"));
        p.put("selection",choice("Chọn tập sách trước khi sắp xếp giá; bestsellers là top bán chạy có số bán > 0", "all","bestsellers"));
        p.put("scope",choice("new tìm mới; continue bổ sung bộ lọc trước", "new","continue"));
        p.put("minPrice",integer("Giá tối thiểu VND; null xóa điều kiện",0,1000000000));
        p.put("maxPrice",integer("Giá tối đa VND; null xóa điều kiện",0,1000000000));
        p.put("minRating",number("Rating tối thiểu 0..5; null xóa điều kiện",0,5));
        p.put("category",text("Tên danh mục")); p.put("author",text("Tên tác giả"));
        p.put("sort",choice("Sắp xếp", "price-asc","price-desc","rating","best","new","sale"));
        p.put("limit",integer("Số kết quả tối đa",1,8));
        return tool("searchProducts","Tìm sách; lọc giá/rating, sách mới, bán chạy. Lọc toàn bộ trước khi giới hạn.",p,(a,c)->{
            Map<String,Object> filters=new LinkedHashMap<>();
            if ("continue".equals(a.path("scope").asText())) filters.putAll(c.state().toolSearch);
            a.fields().forEachRemaining(e->{ if (!Set.of("scope").contains(e.getKey())) {
                if(e.getValue().isNull()) filters.remove(e.getKey());
                else filters.put(e.getKey(),e.getValue().isNumber()?e.getValue().numberValue():e.getValue().asText());
            }});
            Long min=longValue(filters.get("minPrice")), max=longValue(filters.get("maxPrice"));
            if(min!=null && max!=null && min>max) return ChatTool.Result.clarify("Khoảng giá đang bị ngược. Bạn muốn tìm từ bao nhiêu đến bao nhiêu tiền?");
            ChatSearchCriteriaDto criteria=new ChatSearchCriteriaDto(min,max,str(filters,"category"),str(filters,"author"),str(filters,"sort"),List.of());
            if(filters.get("minRating") instanceof Number) criteria.setMinRating(((Number)filters.get("minRating")).doubleValue());
            String query=str(filters,"query");
            List<Product> catalog=catalog();
            ChatCatalogQuery searchQuery=new ChatCatalogQuery(language,data);
            String message=c.request().getMessage();
            String normalizedMessage=language.normalize(message);
            String quoted=searchQuery.quoted(message);
            if(!quoted.isBlank() && normalizedMessage.matches("(?s).*(?:co chu|chua tu|co tu|chua chu|tu khoa).*(?:trong ten|o ten|ten sach).*"))
                filters.put("titleContains",quoted);
            boolean literalTitle=quoted.length()>=12 && (c.request().getMessage().matches("(?is).*\\b(?:cuốn|quyển|sách)\\b.*")
                    || quoted.matches("(?is).*\\b(?:20\\d{2}|programming|quantum|advanced)\\b.*"));
            if(!str(filters,"titleContains").isBlank()) literalTitle=false;
            if(!str(filters,"title").isBlank()){quoted=str(filters,"title");literalTitle=true;}
            if (literalTitle) {
                query=quoted;
                String normalizedTitle=language.normalize(quoted);
                List<Product> named=catalog.stream().filter(b->language.normalize(b.getName()).equals(normalizedTitle)).collect(Collectors.toList());
                List<Product> exact=searchQuery.search("",criteria,named);
                filters.put("query", quoted);
                filters.put("title",quoted);
                c.state().toolSearch=filters; c.state().criteria=criteria;
                c.state().missingTitle=named.isEmpty()?quoted:""; c.state().emptySearch=exact.isEmpty();
                c.state().displayed=ids(exact); c.state().shortlist=new ArrayList<>(ids(exact)); c.state().focus=null;
                return books(named.isEmpty()?"Mình chưa tìm thấy đúng tên sách này trong catalog hiện tại. Mình chưa thể xác nhận giá hoặc tồn kho.":exact.isEmpty()?"Mình tìm thấy tên sách nhưng sách chưa đáp ứng bộ lọc bạn yêu cầu.":"Mình tìm thấy đúng cuốn sách bạn hỏi:",exact,ChatIntent.PRODUCT_INFO,false);
            }
            if(!str(filters,"titleContains").isBlank()) {
                String titlePart=literalText(str(filters,"titleContains"));
                java.util.regex.Pattern titlePattern=java.util.regex.Pattern.compile("(?<![\\p{L}\\p{N}])"+java.util.regex.Pattern.quote(titlePart)+"(?![\\p{L}\\p{N}])");
                catalog=catalog.stream().filter(b->titlePattern.matcher(literalText(b.getName())).find()).collect(Collectors.toList());
                query=""; filters.put("query","");
            } else if(!normalizedMessage.matches("(?s).*(?:tuong tu|gan giong).*")) {
                List<Product> named=searchQuery.named(message,catalog);
                if(named.isEmpty() && !query.isBlank()) named=searchQuery.named(query,catalog);
                if(!named.isEmpty()) catalog=named;
                // Keep explicit topic constraints even when the planner omits query.
                if(query.isBlank() && searchQuery.semanticConstraint(message)) { query=message;filters.put("query",query); }
            }
            // An AI supplied category can be a user concept instead of a database category.
            // Apply it as a topic when no active product has that category name.
            String categoryFilter=str(filters,"category");
            if(!categoryFilter.isBlank() && catalog.stream().noneMatch(b->language.normalize(category(b)).contains(language.normalize(categoryFilter)))) {
                query=(query+" "+categoryFilter).trim();
                filters.remove("category");
                Double minRating=criteria.getMinRating();
                criteria=new ChatSearchCriteriaDto(min,max,"",str(filters,"author"),str(filters,"sort"),List.of());
                criteria.setMinRating(minRating);
                filters.put("query",query);
            }
            // Literal unknown topics must not silently return the whole catalog.
            if(!query.isBlank()) {
                String normalized=language.normalize(query);
                List<String> tokens=Arrays.stream(normalized.split("\\s+")).filter(t->!Set.of("sach","cuon","quyen","ve","cho","toi","minh").contains(t)).collect(Collectors.toList());
                ChatCatalogQuery search=new ChatCatalogQuery(language,data);
                boolean literalUnknown=query.matches("(?is).*\\b(?:20\\d{2}|advanced|quantum|mars)\\b.*");
                if(!search.semanticConstraint(query) && literalUnknown && !tokens.isEmpty()) catalog=catalog.stream().filter(b->{
                    String text=language.normalize(b.getName()+" "+b.getDescription()+" "+b.getAuthor()+" "+category(b));
                    return tokens.stream().allMatch(t->ChatCatalogQuery.word(text,t));
                }).collect(Collectors.toList());
            }
            List<Product> found=new ChatCatalogQuery(language,data).search(query,criteria,catalog);
            int limit=filters.get("limit") instanceof Number?((Number)filters.get("limit")).intValue():5;
            boolean bestsellers="bestsellers".equals(str(filters,"selection")) || normalizedMessage.contains("ban chay");
            if(bestsellers) {
                filters.put("selection","bestsellers");
                found=found.stream().filter(b->b.getSold()>0).sorted(Comparator.comparingInt(Product::getSold).reversed().thenComparing(Product::getProductId)).limit(limit).collect(Collectors.toList());
                found=new ChatCatalogQuery(language,data).search("",criteria,found);
            }
            found=new ArrayList<>(found.subList(0,Math.min(limit,found.size())));
            c.state().toolSearch=filters; c.state().criteria=criteria;
            c.state().missingTitle=""; c.state().emptySearch=found.isEmpty();
            c.state().displayed=ids(found); c.state().shortlist=new ArrayList<>(ids(found)); c.state().focus=null;
            return books(found.isEmpty()?"Mình chưa tìm thấy sách đáp ứng đủ điều kiện. Bạn muốn đổi chủ đề hoặc nới bộ lọc nào?":bestsellers?"Mình chọn các cuốn có số lượng bán cao nhất trong điều kiện bạn yêu cầu, rồi sắp theo thứ tự đã chọn:":"Mình tìm được các cuốn phù hợp dưới đây:",found,ChatIntent.DISCOVER_BOOKS,false);
        });
    }
    @Bean public ChatTool getProducts() {
        Map<String,ChatTool.Parameter> p=referenceParameters();p.put("count",integer("Số sách cần lấy khi nói hai/ba cuốn",1,8));
        p.put("field",choice("Nội dung khách cần; table để lập bảng so sánh", "detail","price","rating","inventory","table"));
        return tool("getProducts","Chi tiết hoặc so sánh sách theo tên/tham chiếu; selection để so sánh danh sách.",p,(a,c)->{
            List<Product> selected=resolve(a,c);
            if(a.hasNonNull("count") && selected.size()>intArg(a,"count",selected.size())) selected=new ArrayList<>(selected.subList(0,intArg(a,"count",selected.size())));
            if(selected.isEmpty()) return missing(c,List.of());
            if("table".equals(a.path("field").asText()) && selected.size()==1 && c.state().comparisonAnchor!=null
                    && !c.state().comparisonAnchor.equals(selected.get(0).getProductId())) {
                List<Product> pair=new ArrayList<>(byIds(List.of(c.state().comparisonAnchor)));
                pair.addAll(selected);selected=pair;
            }
            if("table".equals(a.path("field").asText()) && selected.size()==1) {
                c.state().focus=selected.get(0).getProductId();
                c.state().comparisonAnchor=selected.get(0).getProductId();
                return ChatTool.Result.clarify("Bạn muốn so sánh “"+selected.get(0).getName()+"” với cuốn nào nữa? Bạn gửi tên cuốn thứ hai nhé.");
            }
            c.state().displayed=ids(selected); if(selected.size()==1)c.state().focus=selected.get(0).getProductId();
            String field=a.path("field").asText("detail");
            if(!"detail".equals(field)) {
                Map<Long,Double> ratings=data.ratingSnapshot();
                StringBuilder answer=new StringBuilder("table".equals(field)?"| Tên sách | Tác giả | Giá | Rating |\n|---|---|---:|---:|":"");
                for(Product b:selected){
                    String rating=ratings.containsKey(b.getProductId())?String.format(Locale.ROOT,"%.1f/5",ratings.get(b.getProductId())):"Chưa có đánh giá";
                    if("table".equals(field))answer.append("\n| ").append(cell(b.getName())).append(" | ").append(cell(b.getAuthor())).append(" | ").append(money(data.effectivePrice(b))).append(" | ").append(rating).append(" |");
                    else answer.append("\n• “").append(b.getName()).append("”: ").append("price".equals(field)?money(data.effectivePrice(b)):"rating".equals(field)?rating:"Còn "+b.getQuantity()+" bản theo tồn kho hiện tại.");
                }
                return new ChatTool.Result(answer.toString().trim(),selected.size()==1?ChatIntent.PRODUCT_INFO:ChatIntent.COMPARE_BOOKS,selected.stream().map(this::dto).collect(Collectors.toList()),List.of(),"COMPLETED");
            }
            return books(selected.size()==1?"Thông tin cuốn sách bạn đang hỏi:":"So sánh theo dữ liệu hiện có:",selected,
                    selected.size()==1?ChatIntent.PRODUCT_INFO:ChatIntent.COMPARE_BOOKS,true);
        });
    }
    private String cell(String value){return value==null?"Chưa có dữ liệu":value.replace("|","\\|").replaceAll("[\\r\\n]+"," ");}
    private String literalText(String value){return java.text.Normalizer.normalize(value,java.text.Normalizer.Form.NFC).toLowerCase(Locale.ROOT);}
    @Bean public ChatTool listCategories() {
        return tool("listCategories","Danh mục sách thực tế đang được bán tại cửa hàng.",Map.of(),(a,c)->{
            List<String> names=catalog().stream().map(this::category).filter(n->!n.isBlank()).distinct().sorted().collect(Collectors.toList());
            return ChatTool.Result.text(names.isEmpty()?"Hiện chưa có danh mục sách để hiển thị.":"Các danh mục hiện có:\n• "+String.join("\n• ",names),ChatIntent.DISCOVER_BOOKS);
        });
    }
    @Bean public ChatTool recommendBooks() {
        Map<String,ChatTool.Parameter> p=new LinkedHashMap<>(searchProducts().parameters());
        p.put("level",choice("Trình độ người đọc, không phải từ khóa tên sách","beginner","experienced"));
        p.put("totalBudget",integer("Tổng ngân sách cho tất cả sách được chọn, không phải giá mỗi cuốn",0,1000000000));
        return tool("recommendBooks","Tư vấn chọn sách theo mục tiêu, trình độ và tổng ngân sách; chỉ dùng sách có dữ liệu phù hợp. Giữ query chủ đề khi người dùng bổ sung trình độ.",p,(a,c)->{
            com.fasterxml.jackson.databind.node.ObjectNode search=a.deepCopy();
            search.remove(List.of("level","totalBudget"));
            boolean continuing="continue".equals(a.path("scope").asText());
            int count=intArg(a,"limit",continuing && c.state().toolSearch.get("limit") instanceof Number?((Number)c.state().toolSearch.get("limit")).intValue():3);
            if(!continuing){c.state().level="";c.state().recommendationBudget=null;}
            if(a.hasNonNull("level"))c.state().level=a.path("level").asText();
            if(a.has("totalBudget"))c.state().recommendationBudget=a.hasNonNull("totalBudget")?integerLong(a,"totalBudget"):null;
            Long budget=c.state().recommendationBudget;
            // Search all eligible candidates before applying bundle budget and count.
            search.put("limit",Integer.MAX_VALUE);
            if(budget!=null)search.put("maxPrice",Math.min(budget,a.hasNonNull("maxPrice")?integerLong(a,"maxPrice"):budget));
            ChatTool.Result searched=searchProducts().execute(search,c);
            if(!"COMPLETED".equals(searched.status()))return searched;
            List<Product> candidates=byIds(idsFromDtos(searched.products()));
            String topic=language.normalize(str(c.state().toolSearch,"query"));
            if(ChatCatalogQuery.word(topic,"lap trinh") || ChatCatalogQuery.word(topic,"code"))
                candidates.removeIf(b->!language.normalize(b.getName()+" "+b.getDescription()).matches("(?s).*\\b(lap trinh|ma nguon|python|java|javascript|thuat toan|cau truc du lieu)\\b.*"));
            String level=c.state().level;
            if("beginner".equals(level))candidates.removeIf(b->!language.normalize(b.getDescription()).matches("(?s).*\\b(co ban|can ban|nhap mon|nguoi moi|bat dau|beginner)\\b.*"));
            if("experienced".equals(level))candidates.removeIf(b->{
                String description=language.normalize(b.getDescription());
                return description.matches("(?s).*\\b(co ban|can ban|nhap mon|nguoi moi)\\b.*")
                    && !description.matches("(?s).*\\b(nang cao|chuyen sau|advanced)\\b.*");
            });
            if(budget!=null)candidates.sort(Comparator.comparingLong(data::effectivePrice).thenComparing(Product::getProductId));
            List<Product> selected=new ArrayList<>();long total=0;
            for(Product b:candidates)if(selected.size()<count && (budget==null || total+data.effectivePrice(b)<=budget)){
                selected.add(b);total+=data.effectivePrice(b);
            }
            c.state().displayed=ids(selected);c.state().shortlist=new ArrayList<>(ids(selected));c.state().focus=selected.size()==1?selected.get(0).getProductId():null;
            c.state().emptySearch=selected.isEmpty();c.state().toolSearch.put("limit",count);
            if(selected.isEmpty())return books("Mình chưa tìm thấy sách đủ dữ liệu phù hợp với chủ đề, trình độ và ngân sách này. Bạn muốn xem tài liệu nền tảng liên quan hay đổi điều kiện nào?",selected,ChatIntent.DISCOVER_BOOKS,false);
            String intro="Mình chọn theo chủ đề bạn cần"+("beginner".equals(level)?", ưu tiên mô tả dành cho người mới":"experienced".equals(level)?", tránh sách chỉ giới thiệu căn bản":"")
                +(budget!=null?", ưu tiên giá thấp để giữ tổng trong ngân sách "+money(budget):"")+":";
            ChatTool.Result result=books(intro,selected,ChatIntent.DISCOVER_BOOKS,false);
            return new ChatTool.Result(result.answer()+"\n\nTổng tiền sách: "+money(total)+". Chưa gồm phí giao hàng.",result.intent(),result.products(),result.actions(),result.status());
        });
    }
    private List<Long> idsFromDtos(List<ChatProductDto> books){return books.stream().map(ChatProductDto::getId).collect(Collectors.toList());}
    @Bean public ChatTool findSimilarProducts() {
        return tool("findSimilarProducts","Tìm tên gần giống với sản phẩm chưa có trong catalog; luôn nói đây là sách khác.",Map.of("title",text("Tên sách chưa tìm thấy")),(a,c)->{
            String title=a.path("title").asText(c.state().missingTitle);
            if(title.isBlank())return missing();
            List<Product> all=catalog();
            List<Product> near=all.stream().map(b->Map.entry(b,similarity(title,b.getName()))).filter(e->e.getValue()>=0.25)
                .sorted(Map.Entry.<Product,Double>comparingByValue().reversed().thenComparing(e->e.getKey().getProductId())).limit(3).map(Map.Entry::getKey).collect(Collectors.toList());
            c.state().missingTitle=title;c.state().emptySearch=true;c.state().displayed=ids(near);c.state().shortlist=new ArrayList<>(ids(near));c.state().focus=null;
            return books(near.isEmpty()?"Mình chưa thấy tên nào đủ gần với “"+title+"”.":"Đây là các tên gần giống; chúng là sản phẩm khác với “"+title+"”:",near,ChatIntent.DISCOVER_BOOKS,false);
        });
    }
    @Bean public ChatTool updateSelection() {
        return tool("updateSelection","Bỏ sách khỏi danh sách đang cân nhắc, KHÔNG phải giỏ hàng. most_expensive là giá cao nhất.",referenceParameters(),(a,c)->{
            List<Product> selected=byIds(c.state().shortlist);
            List<Product> removed=resolve(a,c);
            if(removed.size()!=1 || !ids(selected).contains(removed.get(0).getProductId()))return missing();
            selected.removeIf(b->b.getProductId().equals(removed.get(0).getProductId()));
            c.state().shortlist=ids(selected); c.state().displayed=ids(selected);
            if(Objects.equals(c.state().focus,removed.get(0).getProductId()))c.state().focus=null;
            return books("Đã bỏ “"+removed.get(0).getName()+"” khỏi danh sách đang cân nhắc.",selected,ChatIntent.COMPARE_BOOKS,false);
        });
    }
    @Bean public ChatTool prepareCheckout() {
        Map<String,ChatTool.Parameter> p=referenceParameters();p.put("quantity",integer("Số cuốn muốn mua",1,99));
        return tool("prepareCheckout","Chuẩn bị mua ngay trong chat. Chưa tạo đơn; dùng luồng quote/confirm hiện có.",p,(a,c)->{
            List<Product> selected=resolve(a,c); if(selected.size()!=1)return missing(c,selected);
            Product b=selected.get(0);int quantity=intArg(a,"quantity",1);
            if(b.getQuantity()<quantity)return ChatTool.Result.clarify("Số lượng muốn mua vượt tồn kho hiện tại. Bạn chọn số lượng ít hơn nhé.");
            c.state().focus=b.getProductId();
            ChatActionDto action=new ChatActionDto("BUY_NOW","Chuẩn bị đặt hàng",b.getProductId(),null,true);action.setQuantity(quantity);
            return new ChatTool.Result("Mình sẽ chuẩn bị bản nháp cho “"+b.getName()+"”, số lượng "+quantity+". Bạn kiểm tra thông tin giao hàng, xem tổng tiền và xác nhận trước khi đơn được tạo.",ChatIntent.PURCHASE,List.of(dto(b)),List.of(action),"AWAITING_CONFIRMATION");
        });
    }
    @Bean public ChatTool prepareCartChange() {
        Map<String,ChatTool.Parameter> p=referenceParameters();
        p.put("operation",choice("Thao tác giỏ hàng", "add","remove","update"));p.put("quantity",integer("Số lượng thêm hoặc số lượng mới",1,99));
        return tool("prepareCartChange","Yêu cầu thêm/xóa/sửa số lượng trong giỏ trình duyệt. Chỉ tạo nút chờ xác nhận.",p,(a,c)->{
            List<Product> selected=resolve(a,c); if(selected.size()!=1)return missing(c,selected);
            Product b=selected.get(0);String operation=a.path("operation").asText("add");int quantity=intArg(a,"quantity",1);
            int inCart=c.request().getCartItems().stream().filter(i->b.getProductId().equals(i.getProductId())).mapToInt(ChatRequestDto.CartItem::getQuantity).sum();
            if(!"add".equals(operation) && inCart==0)return ChatTool.Result.clarify("Mình không thấy “"+b.getName()+"” trong giỏ hàng của bạn. Giỏ hàng chưa được thay đổi.");
            if(!"remove".equals(operation) && b.getQuantity()<("add".equals(operation)?quantity+inCart:quantity))return ChatTool.Result.clarify("Tổng số lượng trong giỏ sẽ vượt tồn kho hiện tại. Bạn chọn số lượng ít hơn nhé.");
            String type="remove".equals(operation)?"REMOVE_FROM_CART":"update".equals(operation)?"UPDATE_CART_QUANTITY":"ADD_TO_CART";
            String label="remove".equals(operation)?"Xóa khỏi giỏ":"update".equals(operation)?"Đổi số lượng thành "+quantity:"Thêm "+quantity+" cuốn vào giỏ";
            ChatActionDto action=new ChatActionDto(type,label,b.getProductId(),null,true);action.setQuantity(quantity);
            return new ChatTool.Result("Bạn xác nhận thao tác dưới đây với “"+b.getName()+"” nhé. Giỏ hàng chưa được thay đổi.",ChatIntent.PRODUCT_INFO,List.of(dto(b)),List.of(action),"AWAITING_CONFIRMATION");
        });
    }
    @Bean public ChatTool getCart() {
        return tool("getCart","Xem giỏ thiết bị từ snapshot; giá lấy lại từ database.",Map.of(),(a,c)->{
            List<Product> books=byIds(c.request().getCartItems().stream().map(ChatRequestDto.CartItem::getProductId).collect(Collectors.toList()));
            if(books.isEmpty())return ChatTool.Result.text("Giỏ hàng của bạn đang trống hoặc sách không còn được bán.",ChatIntent.UNKNOWN);
            StringBuilder out=new StringBuilder("Giỏ hàng của bạn (giá sách vừa tra cứu):");long total=0;
            for(Product b:books) {
                int quantity=c.request().getCartItems().stream().filter(i->b.getProductId().equals(i.getProductId())).findFirst().orElseThrow().getQuantity();
                total+=data.effectivePrice(b)*quantity;
                out.append("\n• “").append(b.getName()).append("” — ").append(quantity).append(" cuốn × ").append(money(data.effectivePrice(b)));
            }
            out.append("\nTạm tính tiền sách: ").append(money(total)).append(". Phí giao hàng và tồn kho sẽ được kiểm tra khi lập đơn.");
            return ChatTool.Result.text(out.toString(),ChatIntent.UNKNOWN);
        });
    }
    @Bean public ChatTool prepareClearCart() {
        return tool("prepareClearCart","Xóa toàn bộ giỏ hàng, chỉ tạo đề xuất chờ xác nhận; không yêu cầu chọn sách.",Map.of(),(a,c)->{
            if(c.request().getCartItems().isEmpty())return ChatTool.Result.text("Giỏ hàng đang trống, không có sách để xóa.",ChatIntent.UNKNOWN);
            return new ChatTool.Result("Bạn muốn xóa toàn bộ sách khỏi giỏ? Giỏ hàng chỉ thay đổi sau khi bạn bấm Đồng ý.",ChatIntent.UNKNOWN,List.of(),List.of(new ChatActionDto("CLEAR_CART","Xóa toàn bộ giỏ",null,null,true)),"AWAITING_CONFIRMATION");
        });
    }
    @Bean public ChatTool prepareCancelOrder() {
        return tool("prepareCancelOrder","Chuẩn bị hủy đơn của chính khách đã đăng nhập. Không có orderId thì dùng đơn đang hỏi hoặc đơn gần nhất. Kiểm tra trạng thái/thanh toán, chờ khách xác nhận.",Map.of("orderId",integer("Mã đơn",1,9007199254740991L)),(a,c)->{
            String question=language.normalize(c.request().getMessage());
            if(question.matches("(?s).*\\b(?:lam sao|cach|huong dan|nhu the nao|the nao)\\b.*"))
                return ChatTool.Result.text(policies.answer(c.request().getMessage()),ChatIntent.POLICY);
            try {
                Long requested=a.hasNonNull("orderId")?Long.valueOf(integerLong(a,"orderId")):c.state().focusedOrderId;
                Long id=cancellation.preview(requested);
                ChatActionDto action=new ChatActionDto("CANCEL_ORDER","Xác nhận hủy đơn #"+id,null,null,true);action.setOrderId(id);
                return new ChatTool.Result("Đơn #"+id+" có thể hủy. Bạn kiểm tra mã đơn rồi xác nhận bên dưới; hiện đơn chưa bị hủy.",ChatIntent.ORDER_SUPPORT,List.of(),List.of(action),"AWAITING_CONFIRMATION");
            } catch(org.springframework.web.server.ResponseStatusException e) {
                return ChatTool.Result.text(e.getReason()==null?"Chưa thể hủy đơn này.":e.getReason(),ChatIntent.ORDER_SUPPORT);
            }
        });
    }
    @Bean public ChatTool getMyOrders() {
        return tool("getMyOrders","Tra đơn của tài khoản đăng nhập; mode=latest xem đơn gần nhất; recent xem 3 đơn. Không nhận userId/email.",Map.of("mode",choice("Phạm vi đơn","latest","recent")),
                (a,c)->{
                    c.state().focusedOrderId=orders.latestOrderId();
                    return ChatTool.Result.text("latest".equals(a.path("mode").asText()) && c.state().focusedOrderId!=null
                        ?orders.orderById(c.state().focusedOrderId):orders.latestOrders(),ChatIntent.ORDER_SUPPORT);
                });
    }
    @Bean public ChatTool getOrderDetail() {
        return tool("getOrderDetail","Tra mã đơn, backend kiểm tra chủ sở hữu.",Map.of("orderId",integer("Mã đơn cần tra",1,9007199254740991L)),
                (a,c)->{
                    Long id=a.hasNonNull("orderId")?Long.valueOf(integerLong(a,"orderId")):c.state().focusedOrderId;
                    if(id==null) {
                        // No authenticated/focused order: return the account-aware lookup response.
                        return ChatTool.Result.text(orders.latestOrders(),ChatIntent.ORDER_SUPPORT);
                    }
                    String answer=orders.orderById(id);
                    if(answer.startsWith("Đơn #"))c.state().focusedOrderId=id;
                    return ChatTool.Result.text(answer,ChatIntent.ORDER_SUPPORT);
                });
    }
    @Bean public ChatTool getPolicy() {
        return tool("getPolicy","Chính sách vận chuyển, đổi trả, thanh toán của VinaBook.",Map.of(),
                (a,c)->ChatTool.Result.text(policies.answer(c.request().getMessage()),ChatIntent.POLICY));
    }
    @Bean public ChatTool respond() {
        Map<String,ChatTool.Parameter> p=new LinkedHashMap<>();
        p.put("kind",choice("Loại phản hồi","greeting","clarify","unsupported","missing_product"));
        p.put("topic",choice("Nhu cầu đang làm rõ","preferences","product","comparison","gift","address"));
        p.put("scope",choice("Nhu cầu mới hay bổ sung câu hỏi trước","new","continue"));
        p.put("missing",choice("Một thông tin thực sự còn thiếu; auto nếu chưa biết chủ đề","auto","subject","purpose","recipient","level","budget","value"));
        for(String field:List.of("subject","purpose","recipient"))p.put(field,text("Thông tin "+field+" khách đã nói; không suy đoán, không chứa địa chỉ/số điện thoại"));
        p.put("level",choice("Trình độ khách đã nói","beginner","experienced"));
        p.put("budget",integer("Tổng ngân sách VND khách đã nói",0,1000000000));
        return tool("respond","Chào hỏi hoặc hỏi một thông tin còn thiếu. Giữ thông tin khách đã cho để tiếp tục; không bịa chức năng.",p,(a,c)->{
            if("greeting".equals(a.path("kind").asText()))return ChatTool.Result.text("Chào bạn! Mình có thể tìm và so sánh sách, giúp sửa giỏ hàng, tra cứu đơn hoặc chuẩn bị đặt sách ngay tại đây. Bạn đang cần gì?",ChatIntent.SMALL_TALK);
            if("unsupported".equals(a.path("kind").asText()))return ChatTool.Result.clarify("Mình chưa có chức năng thực hiện yêu cầu này. Mình có thể giúp bạn tìm sách, sửa giỏ hàng, tra đơn và chuẩn bị đặt sách.");
            if("missing_product".equals(a.path("kind").asText()))return ChatTool.Result.clarify(c.state().missingTitle.isBlank()
                ?"Mình chưa xác định được cuốn sách cần kiểm tra. Bạn gửi lại tên sách nhé."
                :"Mình vẫn chưa tìm thấy “"+c.state().missingTitle+"” trong catalog hiện tại. Mình chưa có lịch sử ẩn/xóa sản phẩm để xác minh lần bạn thấy trước đó và không thể đoán giá khi chưa xác định được sách.");
            if("new".equals(a.path("scope").asText())) {
                c.state().clarificationFacts.clear();
                c.state().comparisonAnchor=null;
            }
            for(String field:List.of("subject","purpose","recipient","level","budget")) {
                if(a.has(field)) {
                    if(a.get(field).isNull())c.state().clarificationFacts.remove(field);
                    else if(a.get(field).isNumber())c.state().clarificationFacts.put(field,a.get(field).longValue());
                    else c.state().clarificationFacts.put(field,ChatDialogueInterpreter.clean(a.get(field).asText(),180));
                }
            }
            String topic=a.path("topic").asText();
            String missing=a.path("missing").asText("auto");
            Map<String,Object> facts=c.state().clarificationFacts;
            if(topic.isBlank() && facts.containsKey("recipient"))topic="gift";
            // A supplied field must never be asked again. Once a subject is known,
            // optional preferences do not block a first grounded recommendation.
            if(facts.containsKey(missing))missing="auto";
            if(Set.of("","preferences","gift").contains(topic) && "auto".equals(missing) && !str(facts,"subject").isBlank()) {
                var search=new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();
                search.put("query",str(facts,"subject")).put("scope","new");
                if(facts.containsKey("level"))search.put("level",str(facts,"level"));
                if(facts.containsKey("budget"))search.put("totalBudget",longValue(facts.get("budget")));
                return recommendBooks().execute(search,c);
            }
            if(Set.of("","preferences","gift").contains(topic) && !"auto".equals(missing)) {
                String question=switch(missing) {
                    case "purpose" -> "Bạn muốn đọc để giải trí hay để học một kỹ năng cụ thể?";
                    case "recipient" -> "Người nhận quà thuộc khoảng tuổi nào để mình chọn nội dung phù hợp?";
                    case "level" -> "Bạn mới bắt đầu hay đã có nền tảng về chủ đề này?";
                    case "budget" -> "Bạn muốn dành tối đa bao nhiêu tiền cho số sách này?";
                    case "value" -> "Bạn ưu tiên giá thấp, dễ đọc hay nội dung chuyên sâu để mình chọn cuốn đáng tiền theo nhu cầu của bạn?";
                    default -> "gift".equals(topic)?"Người nhận quà thích đọc chủ đề gì?":"Bạn muốn đọc về chủ đề gì?";
                };
                return ChatTool.Result.clarify(question);
            }
            return ChatTool.Result.clarify(clarification(topic,c));
        });
    }
    private String clarification(String topic,ChatTool.Context c) {
        String q=language.normalize(c.request().getMessage());
        if("gift".equals(topic) || q.contains("lam qua") || q.contains("tang ban"))
            return "Người nhận quà thích đọc chủ đề gì? Nếu chưa biết, bạn có thể chọn truyện nhẹ nhàng, kỹ năng sống hoặc sách khám phá.";
        if("comparison".equals(topic) || q.matches("(?s).*(?:so sanh|khac nhau|re hon|rating cao hon|phu hop.*hon|hai cuon).*") )
            return comparisonQuestion(c);
        if("address".equals(topic) || q.contains("dia chi"))
            return "Bạn muốn thêm địa chỉ mới hay chọn địa chỉ đã lưu? Khi đặt sách, bạn có thể chọn địa chỉ trong phần thông tin giao hàng.";
        if("product".equals(topic) || q.matches("(?s).*(?:cuon nay|cuon do|quyen nay|cuon dau|ton kho|bao nhieu ban|gio hang|vao gio|mua \\d+ cuon|gia bao nhieu).*") ) {
            if(c.state().emptySearch && c.state().displayed.isEmpty())
                return "Lượt tìm vừa rồi chưa có sách phù hợp nên chưa có cuốn để chọn. Bạn muốn đổi chủ đề hoặc nới điều kiện tìm kiếm nào?";
            return "Bạn đang nói đến cuốn sách nào? Bạn gửi tên sách hoặc số thứ tự trong danh sách vừa xem nhé.";
        }
        return "Bạn muốn đọc về chủ đề gì? Ví dụ: truyện nhẹ nhàng, lập trình hoặc kỹ năng sống.";
    }
    private String comparisonQuestion(ChatTool.Context c) {
        List<Product> named=new ChatCatalogQuery(language,data).named(c.request().getMessage(),catalog());
        if(named.isEmpty() && c.state().focus!=null)named=byIds(List.of(c.state().focus));
        if(named.size()==1) {
            c.state().focus=named.get(0).getProductId();
            c.state().comparisonAnchor=named.get(0).getProductId();
            return "Bạn muốn so sánh “"+named.get(0).getName()+"” với cuốn nào nữa? Bạn gửi tên cuốn thứ hai nhé.";
        }
        return "Bạn muốn so sánh những cuốn nào? Bạn gửi tên hai cuốn hoặc chọn từ danh sách sách vừa xem nhé.";
    }
    private ChatTool.Result missing(ChatTool.Context c,List<Product> candidates) {
        if(candidates.size()>1) {
            c.state().displayed=ids(candidates);c.state().shortlist=ids(candidates);c.state().focus=null;
            return new ChatTool.Result("Mình tìm thấy nhiều cuốn khớp yêu cầu:\n• "+candidates.stream().map(Product::getName).collect(Collectors.joining("\n• "))
                +"\nBạn chọn tên sách hoặc số thứ tự nào?",ChatIntent.PRODUCT_INFO,candidates.stream().map(this::dto).collect(Collectors.toList()),List.of(),"NEEDS_INPUT");
        }
        return ChatTool.Result.clarify(clarification("product",c));
    }
    private List<Product> catalog(){return products.findByStatusTrue().stream().filter(p->Boolean.TRUE.equals(p.getStatus())).collect(Collectors.toList());}
    private List<Product> byIds(List<Long> ids){return new ChatCatalogQuery(language,data).byIds(ids,catalog());}
    private List<Long> ids(List<Product> books){return books.stream().map(Product::getProductId).collect(Collectors.toList());}
    private List<Product> resolve(JsonNode a,ChatTool.Context c) {
        List<Product> catalog=catalog();ChatCatalogQuery search=new ChatCatalogQuery(language,data);
        List<Long> cartIds=c.request().getCartItems().stream().map(ChatRequestDto.CartItem::getProductId).collect(Collectors.toList());
        boolean cartSource="cart".equals(a.path("source").asText());
        if(a.hasNonNull("title") && !a.path("title").asText().isBlank()) {
            String title=language.normalize(a.path("title").asText());
            return catalog.stream().filter(b->language.normalize(b.getName()).contains(title)).limit(8).collect(Collectors.toList());
        }
        if(a.hasNonNull("productId")) {
            long id=integerLong(a,"productId");
            // A planner cannot select an unseen product merely by inventing its ID.
            if(!c.state().displayed.contains(id) && !c.state().shortlist.contains(id)
                    && !Objects.equals(c.state().focus,id) && !Objects.equals(c.request().getActiveProductId(),id) && !cartIds.contains(id))return List.of();
            return search.byIds(List.of(id),catalog);
        }
        String reference=a.path("reference").asText("focus");
        List<Product> selected=search.byIds(cartSource?cartIds:c.state().shortlist,catalog);
        if("selection".equals(reference))return selected;
        if("cheapest".equals(reference)||"most_expensive".equals(reference)) {
            Comparator<Product> order=Comparator.comparingLong(data::effectivePrice).thenComparing(Product::getProductId);
            if("most_expensive".equals(reference))order=order.reversed();
            return selected.stream().sorted(order).limit(1).collect(Collectors.toList());
        }
        List<Product> displayed=search.byIds(cartSource?cartIds:c.state().displayed,catalog);
        int index="first".equals(reference)?0:"second".equals(reference)?1:"third".equals(reference)?2:"last".equals(reference)?displayed.size()-1:-1;
        if(!"focus".equals(reference))return index>=0&&index<displayed.size()?List.of(displayed.get(index)):List.of();
        Long focus=cartSource?null:c.request().getActiveProductId()!=null?c.request().getActiveProductId():c.state().focus;
        return focus!=null?search.byIds(List.of(focus),catalog):displayed.size()==1?displayed:List.of();
    }
    private ChatTool.Result books(String intro,List<Product> books,ChatIntent intent,boolean detail) {
        StringBuilder text=new StringBuilder(intro);List<ChatActionDto> actions=new ArrayList<>();
        Map<Long,Double> ratings=data.ratingSnapshot();
        for(Product b:books) {
            text.append("\n\n• “").append(b.getName()).append("” — ").append(money(data.effectivePrice(b)))
                .append(" · ").append(b.getAuthor()==null?"Chưa có tác giả":b.getAuthor())
                .append(" · ").append(ratings.containsKey(b.getProductId())?String.format(Locale.ROOT,"%.1f/5",ratings.get(b.getProductId())):"Chưa có đánh giá");
            if(detail)text.append("\n").append(ChatDialogueInterpreter.clean(b.getDescription(),650)).append("\nTồn kho: ").append(b.getQuantity());
            actions.add(new ChatActionDto("VIEW_PRODUCT","Xem sách",b.getProductId(),"/product/"+b.getProductId(),false));
            if(b.getQuantity()>0)actions.add(new ChatActionDto("ADD_TO_CART","Thêm giỏ",b.getProductId(),null,true));
        }
        return new ChatTool.Result(text.toString(),intent,books.stream().map(this::dto).collect(Collectors.toList()),actions,books.isEmpty()?"NEEDS_INPUT":"COMPLETED");
    }
    private ChatProductDto dto(Product b){return new ChatProductDto(b.getProductId(),b.getName(),b.getAuthor(),category(b),data.effectivePrice(b),b.getPrice()==null?0:b.getPrice(),b.getDiscount(),b.getQuantity(),b.getImage());}
    private String category(Product b){return b.getCategory()==null?"":b.getCategory().getCategoryName();}
    private static String str(Map<String,Object> m,String key){return Objects.toString(m.get(key),"");}
    private static Long longValue(Object o){return o instanceof Number?((Number)o).longValue():null;}
    private static int intArg(JsonNode a,String key,int fallback){return a.hasNonNull(key)?Math.toIntExact(integerLong(a,key)):fallback;}
    private static long integerLong(JsonNode a,String key){if(!a.path(key).isIntegralNumber())throw new IllegalArgumentException("Expected integer");return a.path(key).asLong();}
    private String money(long value){return String.format(new Locale("vi","VN"),"%,dđ",value);}
    private double similarity(String a,String b) {
        Set<String> left=new HashSet<>(Arrays.asList(language.normalize(a).split("\\W+"))), right=new HashSet<>(Arrays.asList(language.normalize(b).split("\\W+")));
        left.removeAll(Set.of("sach","cuon","quyen","voi","the","and","with"));right.removeAll(Set.of("sach","cuon","quyen","voi","the","and","with"));
        return (double)left.stream().filter(right::contains).count()/Math.max(1,Math.min(left.size(),right.size()));
    }
    private ChatTool.Result missing(){return ChatTool.Result.clarify("Bạn muốn chọn cuốn nào? Bạn nhắn tên sách hoặc số thứ tự trong danh sách gần nhất nhé.");}
}
